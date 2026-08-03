<#
.SYNOPSIS
    Runs both sides of the SSL check simultaneously: the client test on the
    application server and the collector on the Domain Controller.

.DESCRIPTION
    Run this FROM the application server.

      1. Starts Test-SslServerSide.ps1 on the DC as a background job over
         PowerShell Remoting (WinRM), so it is already watching.
      2. Runs Test-SslConnectivity.ps1 locally against the DC on the same port.
      3. Collects the DC's result and prints a correlated verdict:
         did the traffic arrive, and did the handshake complete.

    Requires WinRM to the DC (Test-WSMan <dc>) and rights to run scripts there.
    If remoting is not allowed, run the two scripts manually - see the README.

    Compatible with Windows PowerShell 5.1.

.PARAMETER DomainController
    FQDN of the DC to test.

.PARAMETER Port
    TCP port. Default 636 (LDAPS).

.PARAMETER Credential
    Optional credential for the remote session.

.PARAMETER LogPath
    Folder for the structured log/CSV output. Default: .\Logs next to the script.

.EXAMPLE
    .\Invoke-SslPathCheck.ps1 -DomainController dc01.corp.local -Port 636
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$DomainController,

    [ValidateRange(1, 65535)]
    [int]$Port = 636,

    [System.Management.Automation.PSCredential]$Credential,

    [string]$LogPath,

    [int]$WatchSeconds = 20
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$root = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$clientScript = Join-Path $root 'Test-SslConnectivity.ps1'
$serverScript = Join-Path $root 'Test-SslServerSide.ps1'

foreach ($f in $clientScript, $serverScript) {
    if (-not (Test-Path -LiteralPath $f)) { throw "Missing required script: $f" }
}

if ([string]::IsNullOrWhiteSpace($LogPath)) { $LogPath = Join-Path $root 'Logs' }
if (-not (Test-Path -LiteralPath $LogPath)) {
    New-Item -Path $LogPath -ItemType Directory -Force | Out-Null
}
$stamp      = Get-Date -Format 'yyyyMMdd_HHmmss'
$serverJson = Join-Path $LogPath "SslCheck_ServerSide_$stamp.json"

# Local IP the DC will see - best effort, used to filter inbound connections.
$clientIp = $null
try {
    $probe = New-Object System.Net.Sockets.TcpClient
    $probe.Connect($DomainController, $Port)
    $clientIp = $probe.Client.LocalEndPoint.Address.IPAddressToString
    $probe.Close()
}
catch {
    Write-Warning "Could not pre-resolve the local source IP ($($_.Exception.Message)); the DC side will watch all clients."
}

Write-Host "Starting server-side collector on $DomainController ..." -ForegroundColor Cyan

$sessionParams = @{ ComputerName = $DomainController }
if ($Credential) { $sessionParams['Credential'] = $Credential }

$session = New-PSSession @sessionParams
try {
    $job = Invoke-Command -Session $session -FilePath $serverScript -AsJob `
               -ArgumentList $Port, $clientIp, $WatchSeconds

    Start-Sleep -Seconds 2   # let the collector reach its watch loop

    Write-Host "Running client-side test from $env:COMPUTERNAME ..." -ForegroundColor Cyan
    $global:LASTEXITCODE = 0
    & $clientScript -Target $DomainController -Port $Port -LogPath $LogPath -IgnoreCertErrors
    $clientExit = $global:LASTEXITCODE

    Write-Host 'Waiting for the server-side collector to finish ...' -ForegroundColor Cyan
    $serverResult = Receive-Job -Job $job -Wait -AutoRemoveJob
}
finally {
    Remove-PSSession -Session $session -ErrorAction SilentlyContinue
}

$serverResult | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $serverJson -Encoding UTF8

# --- Correlated verdict -------------------------------------------------------
Write-Host ''
Write-Host "===== DC side: $($serverResult.Server) port $Port =====" -ForegroundColor Cyan
Write-Host ("Listening            : {0} {1}" -f $serverResult.Listening, $serverResult.ListeningProcess)
Write-Host ("Inbound from client  : {0} connection(s)" -f @($serverResult.InboundConnections).Count)
$serverResult.ProtocolsEnabled | Format-Table -AutoSize
if (@($serverResult.Certificates).Count -gt 0) {
    $serverResult.Certificates | Format-Table Subject, DnsNames, MatchesFqdn, DaysToExpiry -AutoSize
}
if (@($serverResult.SchannelEvents).Count -gt 0) {
    Write-Host 'Schannel/AD events during the test:' -ForegroundColor Yellow
    $serverResult.SchannelEvents | Format-Table TimeCreated, Id, LevelDisplayName, Message -AutoSize
}
foreach ($n in $serverResult.Notes) { Write-Warning $n }

Write-Host ''
Write-Host '===== Verdict =====' -ForegroundColor Cyan
$arrived = (@($serverResult.InboundConnections).Count -gt 0)
if ($clientExit -eq 0 -and $arrived) {
    Write-Host 'SSL path is healthy: traffic reached the DC and the handshake completed.' -ForegroundColor Green
}
elseif (-not $arrived) {
    Write-Host 'Traffic never reached the DC - investigate firewall / routing / NAT between the servers.' -ForegroundColor Red
}
elseif (-not $serverResult.Listening) {
    Write-Host "The DC is not listening on port $Port - the service or its certificate binding is missing." -ForegroundColor Red
}
else {
    Write-Host 'Traffic reached the DC but the TLS handshake failed - check the certificate and protocol details above.' -ForegroundColor Red
}
Write-Host "Server-side detail saved to: $serverJson"
