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

## Assisted evidence harness

Use `homologation-service.ps1` from the same PR branch. It writes sanitized JSON files under `%ProgramData%\PedeAqui\PrintAgent\homologation-evidence` and never serializes the agent token.

Baseline audit:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\homologation-service.ps1 -Mode Audit
```

Controlled restart + second-instance guard + forced runtime crash/recovery:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\homologation-service.ps1 -Mode ExerciseRecovery
```

Prepare a one-shot boot evidence capture:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\homologation-service.ps1 -Mode PrepareReboot
```

Then reboot and **do not log in for at least 60 seconds**. A temporary SYSTEM startup task captures service/process/lock state after 45 seconds, records whether there was no interactive Explorer session, writes `*-boot.json`, and removes itself. This scheduled task exists only as a homologation probe; the Print Agent runtime remains exclusively managed by SCM/WinSW.

For additional diagnostics, use `health-service.ps1`. It reports active/previous/rejected releases without reading or emitting the persisted token. Record only sanitized evidence in #1090.

| Scenario | Expected result | Result | Evidence |
| --- | --- | --- | --- |
| Clean professional install | `PedeAquiPrintAgent` installed/running; no legacy task after validation | PENDING | |
| Baseline assisted audit | `coreHealthy=true`, one runtime, lock present, legacy task absent | PENDING | |
| Reboot without login | `*-boot.json` records `passed=true` and zero interactive Explorer sessions | PENDING | |
| Logout/login / user switch | exactly one agent runtime remains | PENDING | |
| Forced process crash | SCM restarts runtime; assisted recovery evidence passes; no duplicate physical print | PENDING | |
| Network loss/reconnect | no queue purge; agent recovers connectivity | PENDING | |
| Second runtime attempt | guarded runtime exits 73 and does not claim | PENDING | |
| Legacy/duplicate bootstrap | conflict is detected/removed during controlled migration | PENDING | |
| Printer offline | printing reports failure; order state is not auto-advanced | PENDING | |
| One physical copy | exactly one copy when configured for one | PENDING | |
| Two physical copies | exactly two copies when configured for two | PENDING | |
| `printed_unacked` restart | ACK is retried; paper is not printed a second time | PENDING | |
| Successful update | immutable new release activates and heartbeat clears `pending` | PENDING | |
| Failed pending update | launcher restores `previous` automatically and writes `rejected-release.json` | PENDING | |
| Rejected release quarantine | after rollback/restart, the same rejected version is not staged or activated again automatically | PENDING | |
| Explicit rejected-release retry | a controlled retry requires `PEDEAQUI_RETRY_REJECTED_RELEASE=1`; successful heartbeat clears that version's quarantine | PENDING | |
| Manual release rollback | previous version starts with data/spool preserved and abandoned version is quarantined | PENDING | |
| Reinstall/reconnect | identity/data migrate without ownership loop | PENDING | |
| Professional uninstall | service removed; data/spool preserved | PENDING | |
| Explicit legacy restore | saved legacy bootstrap can be restored when requested | PENDING | |

## Final gate

GO requires all rows above to be PASS, CI to be green, no `job not owned by agent` loop, no automatic retry loop for a rejected release, no duplicate physical print, no lost copy configuration, and an explicit final `GO` comment on #1090.

Until then #1066 remains NO-GO.
