# Isolated Windows homologation — evidence template

Issue: #1090  
Blocks: #1066

Do not execute this checklist on a production client workstation. Record date, Windows version, machine identifier (non-PII), Print Agent release and evidence reference for each test.

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
