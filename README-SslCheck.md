# SSL connectivity check: application server -> Domain Controller

Three scripts, all Windows PowerShell 5.1 compatible.

| Script | Runs on | Purpose |
|---|---|---|
| `Test-SslConnectivity.ps1` | application server | TCP connect + real TLS handshake, cert and cipher details |
| `Test-SslServerSide.ps1` | domain controller | listener, certificate, Schannel protocols, firewall, inbound connections, Schannel events |
| `Invoke-SslPathCheck.ps1` | application server | runs both sides at the same time over WinRM and prints one verdict |

## Option A - both sides automatically (recommended)

Requires WinRM to the DC (`Test-WSMan dc01.corp.local`).

```powershell
.\Invoke-SslPathCheck.ps1 -DomainController dc01.corp.local -Port 636
```

It starts the DC collector first, then runs the client test against it, then
correlates: did the traffic arrive, and did the handshake complete.

## Option B - manual, two windows

If remoting is not permitted, start the DC side **first** - it watches for a
fixed window, so the client test must run inside it.

On the DC:

```powershell
.\Test-SslServerSide.ps1 -Port 636 -ClientAddress 10.0.0.50 -WatchSeconds 30 |
    ConvertTo-Json -Depth 5 | Out-File C:\Temp\dc-side.json
```

Within those 30 seconds, on the application server:

```powershell
.\Test-SslConnectivity.ps1 -Target dc01.corp.local -Port 636 -Verbose
```

## Reading the result

| Client | DC saw the connection | Meaning |
|---|---|---|
| handshake OK | yes | path is healthy |
| fails | **no** | blocked before the DC - firewall / routing / NAT |
| fails | yes, port not listening | service or certificate binding missing on the DC |
| fails | yes, listening | TLS-level problem - check protocols and certificate on the DC |
| handshake OK, cert invalid | yes | connectivity fine, certificate wrong (name mismatch or untrusted issuer) |

## Output - one log per side, correlated by RunId

Each side logs locally, on its own machine, and both stamp the **same `RunId`**
into every line so a single attempt can be reconstructed even when several
application servers hit the same DC at once.

On the application server (initiating side), in `Logs\`:

- `SslCheck_<RunId>_CLIENT.log` - `2026-08-03 10:14:02 [OK   ] [CLIENT] [<RunId>] ...`
- `SslCheck_<RunId>_CLIENT.csv` - one row per target, `RunId` included
- `SslCheck_<RunId>_SERVER.json` - copy of the DC result (orchestrator only)

On the domain controller (receiving side), in its own `Logs\`:

- `SslCheck_<RunId>_SERVER.log` - `2026-08-03 10:14:02 [OK   ] [SERVER] [<RunId>] ...`

`Invoke-SslPathCheck.ps1` generates the `RunId` and passes it to both sides.
Running the scripts manually, pass it yourself:

```powershell
# on the DC
.\Test-SslServerSide.ps1 -Port 636 -ClientAddress 10.0.0.50 -WatchSeconds 30 -RunId RUN42
# on the application server, within that window
.\Test-SslConnectivity.ps1 -Target dc01.corp.local -Port 636 -RunId RUN42
```

Then `Select-String RUN42` on both machines returns the two halves of the same test.

Exit code of `Test-SslConnectivity.ps1` is `1` if any target failed - useful for
a Scheduled Task.

## Notes

- Always use the DC **FQDN**; certificate name validation is meaningless otherwise.
- ICMP being blocked says nothing about port 636 - these scripts never gate on ping.
- `-IgnoreCertErrors` completes the handshake anyway so the actual validation
  errors get reported instead of a generic failure.
