# Isolated Windows homologation — evidence template

Issue: #1090  
Blocks: #1066

Do not execute this checklist on a production client workstation. Record date, Windows version, machine identifier (non-PII), Print Agent release and evidence reference for each test.

## Pre-merge homologation of PR #1091

The professional installer supports a custom `-RawRoot`, so the exact PR branch can be homologated **without merging it to `main`**.

Use an isolated Windows machine and an agent token belonging to a dedicated test store/environment. Download the installer script from the PR branch and invoke it elevated with:

```powershell
$env:PEDEAQUI_INSTALL_URL = "https://<test-pedeaqui-host>"
$env:PEDEAQUI_INSTALL_TOKEN = "<one-time-test-agent-token>"
& .\install-service.ps1 `
  -RawRoot "https://raw.githubusercontent.com/wesley956/PedeAqui/printing/professional-agent-int15-gate/print-agent"
```

Do not paste a production token into issue comments, screenshots or logs. After installation, clear the session variables:

```powershell
Remove-Item Env:PEDEAQUI_INSTALL_TOKEN -ErrorAction SilentlyContinue
Remove-Item Env:PEDEAQUI_INSTALL_URL -ErrorAction SilentlyContinue
```

For diagnostics, use `health-service.ps1`. It does not emit the stored agent token. Record only sanitized evidence in #1090.

| Scenario | Expected result | Result | Evidence |
| --- | --- | --- | --- |
| Clean professional install | `PedeAquiPrintAgent` installed/running; no legacy task after validation | PENDING | |
| Reboot without login | service reaches Running and heartbeat without interactive login | PENDING | |
| Logout/login / user switch | exactly one agent runtime remains | PENDING | |
| Forced process crash | SCM restarts runtime; no duplicate physical print | PENDING | |
| Network loss/reconnect | no queue purge; agent recovers connectivity | PENDING | |
| Second runtime attempt | guarded runtime exits 73 and does not claim | PENDING | |
| Legacy/duplicate bootstrap | conflict is detected/removed during controlled migration | PENDING | |
| Printer offline | printing reports failure; order state is not auto-advanced | PENDING | |
| One physical copy | exactly one copy when configured for one | PENDING | |
| Two physical copies | exactly two copies when configured for two | PENDING | |
| `printed_unacked` restart | ACK is retried; paper is not printed a second time | PENDING | |
| Successful update | immutable new release activates and heartbeat clears `pending` | PENDING | |
| Failed pending update | launcher restores `previous` automatically | PENDING | |
| Manual release rollback | previous version starts with data/spool preserved | PENDING | |
| Reinstall/reconnect | identity/data migrate without ownership loop | PENDING | |
| Professional uninstall | service removed; data/spool preserved | PENDING | |
| Explicit legacy restore | saved legacy bootstrap can be restored when requested | PENDING | |

## Final gate

GO requires all rows above to be PASS, CI to be green, no `job not owned by agent` loop, no duplicate physical print, no lost copy configuration, and an explicit final `GO` comment on #1090.

Until then #1066 remains NO-GO.
