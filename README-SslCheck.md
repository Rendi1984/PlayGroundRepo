# SSL connectivity check: application server -> Domain Controller

**One script: `Test-SslPath.ps1`.** Copy the same file to both servers and run it
with a different `-Mode`. Windows PowerShell 5.1 compatible.

| Mode | Run on | What it does |
|---|---|---|
| `Client` (default) | application server | TCP connect + real TLS handshake; protocol, cipher, certificate |
| `Server` | domain controller | listener, certificates, Schannel protocols, firewall, inbound connections, Schannel/AD events |
| `Both` | application server | starts `Server` mode on the DC over WinRM, runs the client test, prints one verdict |

## Usage

```powershell
# Application server - client side only
.\Test-SslPath.ps1 -Target dc01.corp.local -Port 636

# Both sides at once from the application server (requires WinRM to the DC)
.\Test-SslPath.ps1 -Mode Both -Target dc01.corp.local -Port 636

# Manual two-sided run - start the DC FIRST, then the client inside the window
# On the DC:
.\Test-SslPath.ps1 -Mode Server -Port 636 -ClientAddress 10.0.0.50 -WatchSeconds 30 -RunId RUN42
# On the application server, within those 30 seconds:
.\Test-SslPath.ps1 -Mode Client -Target dc01.corp.local -Port 636 -RunId RUN42
```

`-Mode Both` ships this same file to the DC over the remote session, so nothing
has to be pre-copied there.

## Reading the result

| Client | DC saw the connection | Meaning |
|---|---|---|
| handshake OK | yes | path is healthy |
| fails | **no** | blocked before the DC - firewall / routing / NAT |
| fails | yes, port not listening | service or certificate binding missing on the DC |
| fails | yes, listening | TLS-level problem - check protocols and certificate on the DC |
| handshake OK, cert invalid | yes | connectivity fine, certificate wrong (name mismatch or untrusted issuer) |

`-Mode Both` prints this verdict for you.

## Logs - one per side, correlated by RunId

Each side logs locally, on its own machine, and both stamp the same `RunId` into
every line, so a single attempt can be reconstructed even when several
application servers hit the same DC at once.

Application server (initiating side), in `Logs\`:

- `SslCheck_<RunId>_CLIENT.log` - `2026-08-03 10:14:02 [OK   ] [CLIENT] [<RunId>] ...`
- `SslCheck_<RunId>_CLIENT.csv` - one row per target, `RunId` included
- `SslCheck_<RunId>_SERVER.json` - copy of the DC result (`-Mode Both` only)

Domain controller (receiving side), in its own `Logs\`:

- `SslCheck_<RunId>_SERVER.log` - `2026-08-03 10:14:02 [OK   ] [SERVER] [<RunId>] ...`

`-Mode Both` generates the `RunId`; running the sides manually, pass the same
`-RunId` on both servers. Then `Select-String RUN42` on each machine returns the
two halves of the same test.

Exit code is `1` if anything failed, `0` otherwise - useful for a Scheduled Task.

## Notes

- Always use the DC **FQDN**; certificate name validation is meaningless otherwise.
- ICMP being blocked says nothing about port 636 - the script never gates on ping.
- `-IgnoreCertErrors` completes the handshake anyway so the actual validation
  errors get reported instead of a generic failure.
- `-Mode Server` reads the certificate store, the registry and the event log -
  run it elevated on the DC.
