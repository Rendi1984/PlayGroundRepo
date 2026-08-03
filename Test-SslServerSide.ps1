<#
.SYNOPSIS
    Server-side (DC) half of the SSL connectivity check.

.DESCRIPTION
    Runs ON the Domain Controller while the application server runs
    Test-SslConnectivity.ps1 against it. Collects:
      * Is the port actually listening, and by which process
      * Which server-auth certificate(s) could be presented (LocalMachine\My)
      * Schannel protocol enablement from the registry (TLS 1.0/1.1/1.2)
      * Firewall rules covering the port
      * Live inbound connections from the client during the watch window
      * Schannel / LDAP-Interface errors logged during the watch window

    Returns one object; can be called directly or via Invoke-Command.
    Compatible with Windows PowerShell 5.1.

.PARAMETER Port
    TCP port being tested. Default 636 (LDAPS).

.PARAMETER ClientAddress
    IP address of the application server, used to filter inbound connections.

.PARAMETER WatchSeconds
    How long to watch for inbound connections / events. Default 20.

.EXAMPLE
    .\Test-SslServerSide.ps1 -Port 636 -ClientAddress 10.0.0.50 -WatchSeconds 20
#>
[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$Port = 636,

    [string]$ClientAddress,

    [int]$WatchSeconds = 20,

    # Folder for the DC-side log. Default: .\Logs next to the script.
    [string]$LogPath,

    # Shared run identifier - pass the SAME value used on the initiating side
    # so both logs can be correlated. Generated automatically when omitted.
    [string]$RunId
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Continue'

$startTime = Get-Date

# --- Logging (SERVER = the side that receives the connection) -----------------
if ([string]::IsNullOrWhiteSpace($LogPath)) {
    if ($PSScriptRoot) { $LogPath = Join-Path $PSScriptRoot 'Logs' }
    else               { $LogPath = Join-Path (Get-Location).Path 'Logs' }
}
if (-not (Test-Path -LiteralPath $LogPath)) {
    New-Item -Path $LogPath -ItemType Directory -Force | Out-Null
}
if ([string]::IsNullOrWhiteSpace($RunId)) {
    $RunId = (Get-Date -Format 'yyyyMMdd_HHmmss') + '_' + ([guid]::NewGuid().ToString('N').Substring(0, 6))
}
$LogFile = Join-Path $LogPath "SslCheck_${RunId}_SERVER.log"

function Write-Log {
    param(
        [Parameter(Mandatory = $true)][string]$Message,
        [ValidateSet('INFO', 'WARN', 'ERROR', 'OK')][string]$Level = 'INFO'
    )
    $line = '{0} [{1,-5}] [SERVER] [{2}] {3}' -f `
            (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $RunId, $Message
    Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
    Write-Verbose $line
}

$out = [ordered]@{
    RunId               = $RunId
    Side                = 'SERVER'
    LogFile             = $LogFile
    Server              = $env:COMPUTERNAME
    Port                = $Port
    StartTime           = $startTime
    Listening           = $false
    ListeningProcess    = $null
    Certificates        = @()
    ProtocolsEnabled    = @()
    FirewallRules       = @()
    InboundConnections  = @()
    SchannelEvents      = @()
    Notes               = @()
}

$clientLabel = if ($ClientAddress) { $ClientAddress } else { 'any client' }
Write-Log ("Receiving side started on {0}: port {1}, watching {2} for {3} s" -f `
           $env:COMPUTERNAME, $Port, $clientLabel, $WatchSeconds)

# --- 1. Is the port listening? ------------------------------------------------
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
    else {
        $out.Notes += "Port $Port is NOT listening on this server."
    }
}

if ($out.Listening) {
    Write-Log ("Port {0} is listening: {1}" -f $Port, $out.ListeningProcess) -Level OK
}
else {
    Write-Log ("Port {0} is NOT listening on this server" -f $Port) -Level ERROR
}

# --- 2. Candidate server-auth certificates ------------------------------------
try {
    $fqdn = "$env:COMPUTERNAME.$env:USERDNSDOMAIN"
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

# --- 3. Schannel protocol enablement (registry) -------------------------------
$base = 'HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols'
foreach ($proto in 'TLS 1.0', 'TLS 1.1', 'TLS 1.2', 'TLS 1.3') {
    $key = Join-Path $base "$proto\Server"
    $state = 'Not configured (OS default)'
    if (Test-Path $key) {
        $props    = Get-ItemProperty -Path $key -ErrorAction SilentlyContinue
        $enabled  = if ($props -and $props.PSObject.Properties.Name -contains 'Enabled') { $props.Enabled } else { $null }
        $disabled = if ($props -and $props.PSObject.Properties.Name -contains 'DisabledByDefault') { $props.DisabledByDefault } else { $null }
        $state    = "Enabled=$enabled DisabledByDefault=$disabled"
    }
    $out.ProtocolsEnabled += [PSCustomObject]@{ Protocol = $proto; ServerState = $state }
}

# --- 4. Firewall rules covering the port --------------------------------------
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

# --- 5. Watch for inbound connections during the window -----------------------
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

# --- 6. Schannel / LDAP errors logged during the window -----------------------
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

New-Object PSObject -Property $out
