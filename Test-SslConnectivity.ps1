<#
.SYNOPSIS
    Tests SSL/TLS connectivity from an application server to a Domain Controller
    on a specific port (LDAPS 636, Global Catalog SSL 3269, etc.).

.DESCRIPTION
    For each target/port the script:
      1. Opens a TCP connection (with timeout).
      2. Performs a real TLS handshake using SslStream.
      3. Reports negotiated protocol, cipher, and certificate details
         (subject, issuer, validity, days to expiry, chain/name errors).

    Compatible with Windows PowerShell 5.1 - no PS7-only syntax.

.PARAMETER Target
    One or more DC hostnames (use the FQDN so certificate name validation is meaningful).

.PARAMETER Port
    TCP port to test. Default 636 (LDAPS).

.PARAMETER TimeoutMs
    TCP connect / handshake timeout in milliseconds. Default 5000.

.PARAMETER SslProtocol
    TLS version to force. Default 'Default' lets the OS negotiate.

.PARAMETER LogPath
    Folder for the structured output. Every run writes two files:
      SslCheck_<timestamp>.log - timestamped, leveled text log (INFO/OK/WARN/ERROR)
      SslCheck_<timestamp>.csv - one row per target for reporting/monitoring
    Default: a 'Logs' folder next to the script.
    Exit code is 1 if any target failed, 0 otherwise.

.PARAMETER IgnoreCertErrors
    Complete the handshake even if the certificate is untrusted, so the actual
    validation errors can be reported instead of just failing.

.EXAMPLE
    .\Test-SslConnectivity.ps1 -Target dc01.corp.local -Port 636

.EXAMPLE
    .\Test-SslConnectivity.ps1 -Target dc01.corp.local,dc02.corp.local -Port 3269 -IgnoreCertErrors | Format-List
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string[]]$Target,

    [ValidateRange(1, 65535)]
    [int]$Port = 636,

    [int]$TimeoutMs = 5000,

    [ValidateSet('Default', 'Tls', 'Tls11', 'Tls12', 'Tls13')]
    [string]$SslProtocol = 'Default',

    [switch]$IgnoreCertErrors,

    # Folder for the log + CSV output. Default: .\Logs next to the script.
    [string]$LogPath
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

# --- Logging -----------------------------------------------------------------
if ([string]::IsNullOrWhiteSpace($LogPath)) {
    if ($PSScriptRoot) { $LogPath = Join-Path $PSScriptRoot 'Logs' }
    else               { $LogPath = Join-Path (Get-Location).Path 'Logs' }
}
if (-not (Test-Path -LiteralPath $LogPath)) {
    New-Item -Path $LogPath -ItemType Directory -Force | Out-Null
}

$stamp   = Get-Date -Format 'yyyyMMdd_HHmmss'
$LogFile = Join-Path $LogPath "SslCheck_$stamp.log"
$CsvFile = Join-Path $LogPath "SslCheck_$stamp.csv"

function Write-Log {
    param(
        [Parameter(Mandatory = $true)][string]$Message,
        [ValidateSet('INFO', 'WARN', 'ERROR', 'OK')][string]$Level = 'INFO'
    )
    $line = '{0} [{1,-5}] {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message
    Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
    switch ($Level) {
        'ERROR' { Write-Host $line -ForegroundColor Red }
        'WARN'  { Write-Host $line -ForegroundColor Yellow }
        'OK'    { Write-Host $line -ForegroundColor Green }
        default { Write-Host $line }
    }
}

function Test-SslEndpoint {
    param(
        [string]$ComputerName,
        [int]$TcpPort,
        [int]$Timeout,
        [string]$Protocol,
        [bool]$SkipCertValidation
    )

    $result = [ordered]@{
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

# Allow modern TLS from this client process (5.1 defaults can be SSL3/TLS1).
try {
    [System.Net.ServicePointManager]::SecurityProtocol = `
        [System.Net.SecurityProtocolType]::Tls12 -bor [System.Net.ServicePointManager]::SecurityProtocol
}
catch { Write-Verbose "Could not raise SecurityProtocol: $($_.Exception.Message)" }

Write-Log "SSL connectivity check started by $env:USERDOMAIN\$env:USERNAME on $env:COMPUTERNAME"
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

$report | Format-Table Target, Port, TcpConnect, SslHandshake, Protocol, CipherAlgorithm,
                       CertificateValid, DaysToExpiry -AutoSize

# Structured output for reporting / monitoring pickup.
$report | Export-Csv -LiteralPath $CsvFile -NoTypeInformation -Encoding UTF8

$failed = @($report | Where-Object { $_.Error -or -not $_.CertificateValid })
Write-Log ("Done. {0} target(s) tested, {1} with problems. Log: {2} | CSV: {3}" -f `
           @($report).Count, $failed.Count, $LogFile, $CsvFile)

# Emit objects for further processing in the pipeline.
$report

# 0 = all good, 1 = at least one target failed (useful for scheduled tasks).
if ($failed.Count -gt 0) { exit 1 } else { exit 0 }
