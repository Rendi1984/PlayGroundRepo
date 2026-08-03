<#
.SYNOPSIS
    One script, both sides: verifies SSL/TLS traffic from an application server
    to a Domain Controller on a specific port (LDAPS 636, GC SSL 3269, ...).

.DESCRIPTION
    The same file is copied to both servers and run with a different -Mode:

      -Mode Client   Run on the APPLICATION SERVER (the side that initiates).
                     TCP connect + real TLS handshake, reports negotiated
                     protocol, cipher and certificate details.

      -Mode Server   Run on the DOMAIN CONTROLLER (the side that receives).
                     Reports the listener, candidate server-auth certificates,
                     Schannel protocol settings, firewall rules, inbound
                     connections seen during the watch window and any
                     Schannel / AD events raised.

      -Mode Both     Run on the APPLICATION SERVER. Starts -Mode Server on the
                     DC over WinRM, runs the client test against it, and prints
                     one correlated verdict. Requires PowerShell Remoting.

    Each side writes its own log locally, and both stamp the same RunId into
    every line so a single attempt can be reconstructed from the two halves.
    -Mode Both generates the RunId; running the sides manually, pass -RunId
    yourself with the same value on both servers.

    Compatible with Windows PowerShell 5.1 - no PS7-only syntax.

.PARAMETER Mode
    Client (default), Server, or Both. See above.

.PARAMETER Target
    Client/Both: the DC FQDN(s) to test. Use the FQDN, otherwise certificate
    name validation is meaningless. Client mode accepts several targets.

.PARAMETER Port
    TCP port. Default 636 (LDAPS).

.PARAMETER ClientAddress
    Server mode: IP of the application server, to filter inbound connections.

.PARAMETER WatchSeconds
    Server mode: how long to watch for inbound connections and events. Default 20.

.PARAMETER TimeoutMs
    Client mode: TCP connect / handshake timeout in ms. Default 5000.

.PARAMETER SslProtocol
    Client mode: force a TLS version. Default lets the OS negotiate.

.PARAMETER IgnoreCertErrors
    Client mode: complete the handshake even if the certificate is untrusted,
    so the real validation errors are reported instead of a generic failure.

.PARAMETER RunId
    Shared run identifier written into both sides' logs. Generated when omitted.

.PARAMETER LogPath
    Folder for the log/CSV/JSON output. Default: a 'Logs' folder next to the script.

.PARAMETER Credential
    Both mode: credential for the remote session to the DC.

.EXAMPLE
    # On the application server - simplest single-sided check
    .\Test-SslPath.ps1 -Target dc01.corp.local -Port 636

.EXAMPLE
    # Both sides at once, from the application server (needs WinRM to the DC)
    .\Test-SslPath.ps1 -Mode Both -Target dc01.corp.local -Port 636

.EXAMPLE
    # Manual two-sided run - start the DC first, then the client inside the window
    .\Test-SslPath.ps1 -Mode Server -Port 636 -ClientAddress 10.0.0.50 -WatchSeconds 30 -RunId RUN42
    .\Test-SslPath.ps1 -Mode Client -Target dc01.corp.local -Port 636 -RunId RUN42
#>
[CmdletBinding()]
param(
    [ValidateSet('Client', 'Server', 'Both')]
    [string]$Mode = 'Client',

    [string[]]$Target,

    [ValidateRange(1, 65535)]
    [int]$Port = 636,

    [string]$ClientAddress,

    [int]$WatchSeconds = 20,

    [int]$TimeoutMs = 5000,

    [ValidateSet('Default', 'Tls', 'Tls11', 'Tls12', 'Tls13')]
    [string]$SslProtocol = 'Default',

    [switch]$IgnoreCertErrors,

    [string]$RunId,

    [string]$LogPath,

    [System.Management.Automation.PSCredential]$Credential,

    # Suppresses the terminating exit code. Used when -Mode Both runs this same
    # script inside a remote runspace, where 'exit' would kill the session.
    [switch]$NoExitCode
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

if ($Mode -ne 'Server' -and (-not $Target -or $Target.Count -eq 0)) {
    throw "-Target is required in -Mode $Mode (the DC FQDN to test)."
}

# --- Shared setup: run id + logging ------------------------------------------
if ([string]::IsNullOrWhiteSpace($RunId)) {
    $RunId = (Get-Date -Format 'yyyyMMdd_HHmmss') + '_' + ([guid]::NewGuid().ToString('N').Substring(0, 6))
}

if ([string]::IsNullOrWhiteSpace($LogPath)) {
    if ($PSScriptRoot) { $LogPath = Join-Path $PSScriptRoot 'Logs' }
    else               { $LogPath = Join-Path (Get-Location).Path 'Logs' }
}
if (-not (Test-Path -LiteralPath $LogPath)) {
    New-Item -Path $LogPath -ItemType Directory -Force | Out-Null
}

# 'Both' logs its client half under the CLIENT side, like a plain client run.
$Side     = if ($Mode -eq 'Server') { 'SERVER' } else { 'CLIENT' }
$LogFile  = Join-Path $LogPath "SslCheck_${RunId}_$Side.log"
$CsvFile  = Join-Path $LogPath "SslCheck_${RunId}_$Side.csv"

function Write-Log {
    param(
        [Parameter(Mandatory = $true)][string]$Message,
        [ValidateSet('INFO', 'WARN', 'ERROR', 'OK')][string]$Level = 'INFO'
    )
    $line = '{0} [{1,-5}] [{2}] [{3}] {4}' -f `
            (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Side, $RunId, $Message
    Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
    switch ($Level) {
        'ERROR' { Write-Host $line -ForegroundColor Red }
        'WARN'  { Write-Host $line -ForegroundColor Yellow }
        'OK'    { Write-Host $line -ForegroundColor Green }
        default { Write-Host $line }
    }
}

# =============================================================================
# CLIENT SIDE - initiates the connection
# =============================================================================
function Test-SslEndpoint {
    param(
        [string]$ComputerName,
        [int]$TcpPort,
        [int]$Timeout,
        [string]$Protocol,
        [bool]$SkipCertValidation
    )

    $result = [ordered]@{
        RunId            = $RunId
        Side             = 'CLIENT'
        Source           = $env:COMPUTERNAME
        Timestamp        = Get-Date
        Target           = $ComputerName
        Port             = $TcpPort
        TcpConnect       = $false
        SslHandshake     = $false
        Protocol         = $null
        CipherAlgorithm  = $null
        CipherStrength   = $null
        Subject          = $null
        Issuer           = $null
        NotAfter         = $null
        DaysToExpiry     = $null
        Thumbprint       = $null
        CertificateValid = $null
        PolicyErrors     = $null
        Error            = $null
    }

    $client = $null
    $ssl    = $null
    $script:PolicyErrors = 'None'

    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $async  = $client.BeginConnect($ComputerName, $TcpPort, $null, $null)

        if (-not $async.AsyncWaitHandle.WaitOne($Timeout, $false)) {
            throw "TCP connect timed out after $Timeout ms"
        }
        $client.EndConnect($async)      # surfaces DNS / refused / unreachable
        $result.TcpConnect = $true

        $client.SendTimeout    = $Timeout
        $client.ReceiveTimeout = $Timeout

        # Capture validation result without necessarily failing the handshake.
        $validationCallback = {
            param($sender, $certificate, $chain, $sslPolicyErrors)
            $script:PolicyErrors = $sslPolicyErrors.ToString()
            if ($SkipCertValidation) { return $true }
            return ($sslPolicyErrors -eq [System.Net.Security.SslPolicyErrors]::None)
        }

        $ssl = New-Object System.Net.Security.SslStream(
            $client.GetStream(),
            $false,
            [System.Net.Security.RemoteCertificateValidationCallback]$validationCallback
        )

        if ($Protocol -eq 'Default') {
            # 'None' = let the OS/SCHANNEL pick the best protocol (recommended).
            $enum = [System.Security.Authentication.SslProtocols]::None
        }
        else {
            # Tls13 only exists on newer .NET Framework builds.
            try   { $enum = [System.Security.Authentication.SslProtocols]$Protocol }
            catch { throw "SslProtocol '$Protocol' is not supported by this .NET version" }
        }

        # SNI / cert name validation is done against the name passed here.
        $ssl.AuthenticateAsClient($ComputerName, $null, $enum, $false)
        $result.SslHandshake = $true

        $result.Protocol        = $ssl.SslProtocol.ToString()
        $result.CipherAlgorithm = $ssl.CipherAlgorithm.ToString()
        $result.CipherStrength  = $ssl.CipherStrength

        if ($null -ne $ssl.RemoteCertificate) {
            $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($ssl.RemoteCertificate)
            $result.Subject      = $cert.Subject
            $result.Issuer       = $cert.Issuer
            $result.NotAfter     = $cert.NotAfter
            $result.DaysToExpiry = [int]([math]::Floor(($cert.NotAfter - (Get-Date)).TotalDays))
            $result.Thumbprint   = $cert.Thumbprint
        }

        $result.PolicyErrors     = $script:PolicyErrors
        $result.CertificateValid = ($script:PolicyErrors -eq 'None')
    }
    catch {
        $result.Error = $_.Exception.Message
        if ($null -ne $script:PolicyErrors) { $result.PolicyErrors = $script:PolicyErrors }
    }
    finally {
        if ($null -ne $ssl)    { $ssl.Dispose() }
        if ($null -ne $client) { $client.Close() }
    }

    return New-Object PSObject -Property $result
}

function Invoke-ClientSide {
    # Allow modern TLS from this client process (5.1 defaults can be SSL3/TLS1).
    try {
        [System.Net.ServicePointManager]::SecurityProtocol = `
            [System.Net.SecurityProtocolType]::Tls12 -bor [System.Net.ServicePointManager]::SecurityProtocol
    }
    catch { Write-Verbose "Could not raise SecurityProtocol: $($_.Exception.Message)" }

    Write-Log "Initiating side started by $env:USERDOMAIN\$env:USERNAME on $env:COMPUTERNAME"
    Write-Log ("Targets: {0} | Port: {1} | Protocol: {2} | Timeout: {3} ms | IgnoreCertErrors: {4}" -f `
               ($Target -join ', '), $Port, $SslProtocol, $TimeoutMs, [bool]$IgnoreCertErrors)

    $report = foreach ($t in $Target) {
        Write-Log "Testing ${t}:$Port ..."
        $r = Test-SslEndpoint -ComputerName $t -TcpPort $Port -Timeout $TimeoutMs `
                              -Protocol $SslProtocol -SkipCertValidation ([bool]$IgnoreCertErrors)

        if ($r.Error) {
            Write-Log ("{0}:{1} FAILED - {2}" -f $r.Target, $r.Port, $r.Error) -Level ERROR
        }
        else {
            Write-Log ("{0}:{1} handshake OK - {2} / {3} ({4} bit) | cert '{5}' issued by '{6}' expires {7} ({8} days)" -f `
                       $r.Target, $r.Port, $r.Protocol, $r.CipherAlgorithm, $r.CipherStrength,
                       $r.Subject, $r.Issuer, $r.NotAfter, $r.DaysToExpiry) -Level OK

            if (-not $r.CertificateValid) {
                Write-Log ("{0}:{1} certificate validation errors: {2}" -f $r.Target, $r.Port, $r.PolicyErrors) -Level WARN
            }
            if ($r.DaysToExpiry -lt 30) {
                Write-Log ("{0}:{1} certificate expires in {2} days" -f $r.Target, $r.Port, $r.DaysToExpiry) -Level WARN
            }
        }
        $r
    }

    # Out-Host so the table is displayed without polluting the return value.
    $report | Format-Table Target, Port, TcpConnect, SslHandshake, Protocol, CipherAlgorithm,
                           CertificateValid, DaysToExpiry -AutoSize | Out-Host
    $report | Export-Csv -LiteralPath $CsvFile -NoTypeInformation -Encoding UTF8

    $failed = @($report | Where-Object { $_.Error -or -not $_.CertificateValid })
    Write-Log ("Initiating side done. {0} target(s) tested, {1} with problems. Log: {2} | CSV: {3}" -f `
               @($report).Count, $failed.Count, $LogFile, $CsvFile)

    return $report
}

# =============================================================================
# SERVER SIDE - receives the connection (run this on the DC)
# =============================================================================
function Invoke-ServerSide {
    $ErrorActionPreference = 'Continue'
    $startTime = Get-Date

    $out = [ordered]@{
        RunId              = $RunId
        Side               = 'SERVER'
        Server             = $env:COMPUTERNAME
        LogFile            = $LogFile
        Port               = $Port
        StartTime          = $startTime
        Listening          = $false
        ListeningProcess   = $null
        Certificates       = @()
        ProtocolsEnabled   = @()
        FirewallRules      = @()
        InboundConnections = @()
        SchannelEvents     = @()
        Notes              = @()
    }

    $clientLabel = if ($ClientAddress) { $ClientAddress } else { 'any client' }
    Write-Log ("Receiving side started on {0}: port {1}, watching {2} for {3} s" -f `
               $env:COMPUTERNAME, $Port, $clientLabel, $WatchSeconds)

    # --- 1. Is the port listening? --------------------------------------------
    try {
        $listen = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop
        $out.Listening = $true
        $pids = $listen | Select-Object -ExpandProperty OwningProcess -Unique
        $out.ListeningProcess = ($pids | ForEach-Object {
            $p = Get-Process -Id $_ -ErrorAction SilentlyContinue
            if ($p) { "$($p.ProcessName) (PID $_)" } else { "PID $_" }
        }) -join ', '
    }
    catch {
        # Fallback for hosts without the NetTCPIP module.
        $netstat = netstat -ano | Select-String ":$Port\s" | Select-String 'LISTENING'
        if ($netstat) {
            $out.Listening = $true
            $out.ListeningProcess = ($netstat -join '; ').Trim()
        }
    }

    if ($out.Listening) {
        Write-Log ("Port {0} is listening: {1}" -f $Port, $out.ListeningProcess) -Level OK
    }
    else {
        $out.Notes += "Port $Port is NOT listening on this server."
        Write-Log ("Port {0} is NOT listening on this server" -f $Port) -Level ERROR
    }

    # --- 2. Candidate server-auth certificates --------------------------------
    try {
        $fqdn  = "$env:COMPUTERNAME.$env:USERDNSDOMAIN"
        $certs = Get-ChildItem Cert:\LocalMachine\My -ErrorAction Stop | Where-Object {
            $_.HasPrivateKey -and
            ($_.EnhancedKeyUsageList.Count -eq 0 -or
             ($_.EnhancedKeyUsageList | Where-Object { $_.ObjectId -eq '1.3.6.1.5.5.7.3.1' }))
        }
        $out.Certificates = @($certs | ForEach-Object {
            [PSCustomObject]@{
                Subject      = $_.Subject
                Issuer       = $_.Issuer
                Thumbprint   = $_.Thumbprint
                NotAfter     = $_.NotAfter
                DaysToExpiry = [int]([math]::Floor(($_.NotAfter - (Get-Date)).TotalDays))
                DnsNames     = ($_.DnsNameList | ForEach-Object { $_.Unicode }) -join ', '
                MatchesFqdn  = [bool](($_.DnsNameList | ForEach-Object { $_.Unicode }) -contains $fqdn)
                Expired      = ($_.NotAfter -lt (Get-Date))
            }
        })
        if ($out.Certificates.Count -eq 0) {
            $out.Notes += 'No server-authentication certificate with a private key found in LocalMachine\My.'
        }
        elseif (-not ($out.Certificates | Where-Object { $_.MatchesFqdn -and -not $_.Expired })) {
            $out.Notes += "No valid certificate whose SAN matches $fqdn - expect a name-mismatch error on the client."
        }
    }
    catch {
        $out.Notes += "Certificate store read failed: $($_.Exception.Message)"
    }

    foreach ($c in $out.Certificates) {
        Write-Log ("Candidate certificate '{0}' | SAN: {1} | matches FQDN: {2} | expires {3} ({4} days)" -f `
                   $c.Subject, $c.DnsNames, $c.MatchesFqdn, $c.NotAfter, $c.DaysToExpiry)
    }

    # --- 3. Schannel protocol enablement (registry) ---------------------------
    $base = 'HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols'
    foreach ($proto in 'TLS 1.0', 'TLS 1.1', 'TLS 1.2', 'TLS 1.3') {
        $key   = Join-Path $base "$proto\Server"
        $state = 'Not configured (OS default)'
        if (Test-Path $key) {
            $props    = Get-ItemProperty -Path $key -ErrorAction SilentlyContinue
            $enabled  = if ($props -and $props.PSObject.Properties.Name -contains 'Enabled') { $props.Enabled } else { $null }
            $disabled = if ($props -and $props.PSObject.Properties.Name -contains 'DisabledByDefault') { $props.DisabledByDefault } else { $null }
            $state    = "Enabled=$enabled DisabledByDefault=$disabled"
        }
        $out.ProtocolsEnabled += [PSCustomObject]@{ Protocol = $proto; ServerState = $state }
        Write-Log ("Schannel {0} (server): {1}" -f $proto, $state)
    }

    # --- 4. Firewall rules covering the port ----------------------------------
    try {
        $out.FirewallRules = @(
            Get-NetFirewallPortFilter -ErrorAction Stop |
                Where-Object { $_.LocalPort -eq $Port -or $_.LocalPort -eq 'Any' } |
                Get-NetFirewallRule -ErrorAction SilentlyContinue |
                Where-Object { $_.Enabled -eq 'True' -and $_.Direction -eq 'Inbound' } |
                Select-Object -First 10 DisplayName, Action, Profile
        )
    }
    catch {
        $out.Notes += "Firewall rule query unavailable: $($_.Exception.Message)"
    }

    # --- 5. Watch for inbound connections during the window -------------------
    $seen     = @{}
    $deadline = (Get-Date).AddSeconds($WatchSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $conns = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
                     Where-Object { $_.State -ne 'Listen' }
            foreach ($c in $conns) {
                if ($ClientAddress -and $c.RemoteAddress -ne $ClientAddress) { continue }
                $key = "$($c.RemoteAddress):$($c.RemotePort)"
                if (-not $seen.ContainsKey($key)) {
                    $seen[$key] = [PSCustomObject]@{
                        RemoteAddress = $c.RemoteAddress
                        RemotePort    = $c.RemotePort
                        State         = $c.State.ToString()
                        SeenAt        = Get-Date
                    }
                }
            }
        }
        catch { }
        Start-Sleep -Milliseconds 500
    }
    $out.InboundConnections = @($seen.Values)

    foreach ($c in $out.InboundConnections) {
        Write-Log ("Inbound connection observed from {0}:{1} state {2}" -f `
                   $c.RemoteAddress, $c.RemotePort, $c.State) -Level OK
    }
    if ($out.InboundConnections.Count -eq 0) {
        $filter = if ($ClientAddress) { " from $ClientAddress" } else { '' }
        $out.Notes += "No inbound connection$filter observed on port $Port during the $WatchSeconds s window - traffic is likely blocked before reaching this server (firewall/routing)."
    }

    # --- 6. Schannel / LDAP errors logged during the window -------------------
    try {
        $out.SchannelEvents = @(
            Get-WinEvent -FilterHashtable @{
                LogName      = 'System'
                ProviderName = 'Schannel', 'Microsoft-Windows-ActiveDirectory_DomainService'
                StartTime    = $startTime
            } -ErrorAction Stop |
            Select-Object TimeCreated, Id, LevelDisplayName, @{n='Message';e={($_.Message -split "`n")[0]}}
        )
    }
    catch {
        # No matching events is the normal, healthy case.
    }

    foreach ($e in $out.SchannelEvents) {
        Write-Log ("Event {0} ({1}) at {2}: {3}" -f $e.Id, $e.LevelDisplayName, $e.TimeCreated, $e.Message) -Level WARN
    }
    foreach ($n in $out.Notes) { Write-Log $n -Level WARN }
    Write-Log ("Receiving side finished. Log: {0}" -f $LogFile)

    return New-Object PSObject -Property $out
}

# =============================================================================
# BOTH - drive the DC side over WinRM, then run the client side locally
# =============================================================================
function Invoke-BothSides {
    $dc = $Target[0]
    if ($Target.Count -gt 1) {
        Write-Log "-Mode Both tests a single DC; using $dc and ignoring the rest." -Level WARN
    }

    # Local source IP the DC will see - best effort, used to filter connections.
    $srcIp = $null
    try {
        $probe = New-Object System.Net.Sockets.TcpClient
        $probe.Connect($dc, $Port)
        $srcIp = $probe.Client.LocalEndPoint.Address.IPAddressToString
        $probe.Close()
    }
    catch {
        Write-Log "Could not pre-resolve the local source IP ($($_.Exception.Message)); the DC side will watch all clients." -Level WARN
    }

    $sessionParams = @{ ComputerName = $dc }
    if ($Credential) { $sessionParams['Credential'] = $Credential }

    Write-Log "Starting the receiving side on $dc over WinRM ..."
    $session = New-PSSession @sessionParams
    try {
        # Ship this very script to the DC and run it there in -Mode Server,
        # splatting named parameters (a switch cannot bind positionally).
        $scriptText   = Get-Content -LiteralPath $PSCommandPath -Raw
        $remoteParams = @{
            Mode          = 'Server'
            Port          = $Port
            WatchSeconds  = $WatchSeconds
            RunId         = $RunId
            NoExitCode    = $true
        }
        if ($srcIp) { $remoteParams['ClientAddress'] = $srcIp }

        $runner = {
            param($Text, $Params)
            $sb = [scriptblock]::Create($Text)
            & $sb @Params
        }
        $job = Invoke-Command -Session $session -ScriptBlock $runner `
                   -ArgumentList $scriptText, $remoteParams -AsJob

        Start-Sleep -Seconds 2   # let the collector reach its watch loop

        $clientReport = Invoke-ClientSide

        Write-Log 'Waiting for the receiving side to finish ...'
        $serverResult = Receive-Job -Job $job -Wait -AutoRemoveJob
    }
    finally {
        Remove-PSSession -Session $session -ErrorAction SilentlyContinue
    }

    $serverJson = Join-Path $LogPath "SslCheck_${RunId}_SERVER.json"
    $serverResult | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $serverJson -Encoding UTF8

    # --- Correlated verdict ---------------------------------------------------
    Write-Host ''
    Write-Host "===== Receiving side: $($serverResult.Server) port $Port =====" -ForegroundColor Cyan
    Write-Host ("Listening           : {0} {1}" -f $serverResult.Listening, $serverResult.ListeningProcess)
    Write-Host ("Inbound from client : {0} connection(s)" -f @($serverResult.InboundConnections).Count)
    $serverResult.ProtocolsEnabled | Format-Table -AutoSize | Out-Host
    if (@($serverResult.Certificates).Count -gt 0) {
        $serverResult.Certificates | Format-Table Subject, DnsNames, MatchesFqdn, DaysToExpiry -AutoSize | Out-Host
    }
    if (@($serverResult.SchannelEvents).Count -gt 0) {
        Write-Host 'Schannel/AD events during the test:' -ForegroundColor Yellow
        $serverResult.SchannelEvents | Format-Table TimeCreated, Id, LevelDisplayName, Message -AutoSize | Out-Host
    }
    foreach ($n in $serverResult.Notes) { Write-Warning $n }

    $arrived    = (@($serverResult.InboundConnections).Count -gt 0)
    $clientGood = -not (@($clientReport | Where-Object { $_.Error -or -not $_.CertificateValid }).Count)

    Write-Host ''
    Write-Host '===== Verdict =====' -ForegroundColor Cyan
    if ($clientGood -and $arrived) {
        Write-Host 'SSL path is healthy: traffic reached the DC and the handshake completed.' -ForegroundColor Green
    }
    elseif (-not $arrived) {
        Write-Host 'Traffic never reached the DC - investigate firewall / routing / NAT between the servers.' -ForegroundColor Red
    }
    elseif (-not $serverResult.Listening) {
        Write-Host "The DC is not listening on port $Port - the service or its certificate binding is missing." -ForegroundColor Red
    }
    else {
        Write-Host 'Traffic reached the DC but the TLS check failed - see the certificate and protocol details above.' -ForegroundColor Red
    }

    Write-Host ''
    Write-Host "RunId $RunId - correlated logs:" -ForegroundColor Cyan
    Write-Host ("  initiating side ({0}): {1}" -f $env:COMPUTERNAME, $LogFile)
    Write-Host ("  receiving side  ({0}): {1}" -f $serverResult.Server, $serverResult.LogFile)
    Write-Host ("  receiving-side detail copied locally: {0}" -f $serverJson)

    return [PSCustomObject]@{
        RunId  = $RunId
        Client = $clientReport
        Server = $serverResult
    }
}

# =============================================================================
# Dispatch
# =============================================================================
$failures = 0

switch ($Mode) {
    'Client' {
        $r = Invoke-ClientSide
        $failures = @($r | Where-Object { $_.Error -or -not $_.CertificateValid }).Count
        $r
    }
    'Server' {
        $r = Invoke-ServerSide
        if (-not $r.Listening -or @($r.InboundConnections).Count -eq 0) { $failures = 1 }
        $r
    }
    'Both' {
        $r = Invoke-BothSides
        $failures = @($r.Client | Where-Object { $_.Error -or -not $_.CertificateValid }).Count
        if (@($r.Server.InboundConnections).Count -eq 0) { $failures++ }
        $r
    }
}

# 0 = all good, 1 = something failed (useful for a Scheduled Task).
if (-not $NoExitCode) {
    if ($failures -gt 0) { exit 1 } else { exit 0 }
}
