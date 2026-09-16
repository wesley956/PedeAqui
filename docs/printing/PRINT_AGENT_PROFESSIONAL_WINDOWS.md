# Professional Windows Print Agent — INT-15 gate

This document is the operational contract for the professional PedeAqui Print Agent required before the Intelligence pilot can receive GO.

## Runtime model

The production Windows bootstrap is a Windows Service named `PedeAquiPrintAgent`. The Service Control Manager starts it automatically through a pinned WinSW 2.12.0 wrapper. WinSW runs `service-launcher.ps1`, which launches Node through `service-bootstrap.mjs`.

The bootstrap owns the local single-instance lock and only then imports the existing printing runtime. The legacy `Scheduled Task + VBS + CMD watchdog` remains a migration fallback only; it is not the professional target architecture.

## Filesystem contract

```text
%ProgramData%\PedeAqui\PrintAgent\
  service\
    PedeAquiPrintAgent.exe
    PedeAquiPrintAgent.xml
    service-launcher.ps1
  releases\
    <version>\
      src\...
      package.json
      manifest.json
  data\
    service.env.json
    agent.lock
    spool\...
  logs\...
  current.json
  previous.json
  legacy-backup\...
```

`data` is intentionally outside `releases`. A code update or rollback must never delete the token, spool or persistent installation state.

## Installation and migration

The panel-generated assisted installer downloads `windows/install-service.ps1` and runs it elevated. The installer:

1. resolves/installs Node LTS;
2. downloads and syntax-checks the current Print Agent release into a staging directory;
3. moves the complete release into `releases/<version>`;
4. migrates spool entries by copying them into `data/spool` without deleting the original source;
5. exports and disables the legacy Scheduled Task when present, and backs up the legacy VBS/CMD bootstrap;
6. downloads WinSW 2.12.0 from the official project and verifies SHA-256 `05b82d46ad331cc16bdc00de5c6332c1ef818df8ceefcd49c726553209b3a0da`;
7. installs and starts `PedeAquiPrintAgent` through Windows SCM;
8. validates service state, the guarded Node process, local lock and authenticated PedeAqui connectivity;
9. only after validation, deletes the old scheduled task/startup fallback.

If validation fails, the service is removed and the saved legacy bootstrap is restored when available. No queue/spool purge is part of rollback.

## Single-instance

The SCM service is the primary process owner. `service-bootstrap.mjs` adds a second local guard at `data/agent.lock`. A concurrent professional runtime exits with code `73` before it can claim a print job. Stale PID locks are removed on the next start after the old process is confirmed absent.

The installer disables the old task before starting the professional service so two supported bootstraps cannot claim concurrently during migration.

## Update and rollback

Automatic update never copies files over the running release.

1. the updater downloads the remote manifest and files to a unique staging directory;
2. every `.mjs` file is syntax-checked before activation;
3. a complete immutable `releases/<new-version>` directory is created;
4. the old `current.json` is saved as `previous.json`;
5. the new release becomes `current` with `pending=true` and `attempts=0`;
6. the Windows service restarts and the launcher gives the pending release one boot attempt;
7. `service-bootstrap.mjs` marks it healthy only after a successful `/api/print-agent/heartbeat` response;
8. if the process restarts before that heartbeat, the launcher restores `previous.json` automatically.

`rollback-service.ps1` performs the same previous-release switch explicitly. It does not delete persistent data.

The professional installer deliberately does not force-migrate existing production agents through self-update. Migration remains operator initiated until the Windows homologation gate is complete.

## Printed-but-unacknowledged invariant

Existing spool semantics remain authoritative. `printed_unacked` is recovered by retrying ACK; restart/update/rollback does **not** print the job again merely because the agent restarted. Spool is stored under `data/spool` in the professional service.

A printing failure must remain a printing failure. Service recovery must not mutate order workflow/status to hide a printer problem.

## Diagnostics

Run elevated:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\health-service.ps1
```

The diagnostic output includes service state, active/pending release, previous version, lock PID, matching process count, legacy-task presence and spool count. It intentionally does not read or output `service.env.json` or the agent token.

## Explicit rollback

Release rollback:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\rollback-service.ps1
```

Remove professional service while preserving all PedeAqui data:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\uninstall-service.ps1
```

Remove service and request restoration of the saved legacy bootstrap:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\uninstall-service.ps1 -RestoreLegacy
```

## Automated gates

The normal CI syntax-checks every Print Agent module and executes repository tests. `Print Agent Windows` runs on `windows-latest` and additionally:

- parses all Windows PowerShell scripts;
- installs the real SCM service through the pinned WinSW binary;
- starts and stops the service;
- proves creation of the single-instance lock;
- starts a second guarded runtime and requires exit code `73`;
- simulates a failed pending release and requires automatic restoration of the previous release;
- uninstalls the test service in cleanup.

## Manual Windows homologation still required

Automated CI cannot prove physical paper delivery or a real workstation reboot. Before #1066 can receive GO, an isolated Windows machine must record evidence for:

- clean install;
- boot/reboot without user login;
- logout/login and user switch;
- process/service crash and recovery;
- internet loss and reconnection;
- printer offline/failure;
- one-copy and two-copy physical jobs;
- `printed_unacked` recovery with no second physical print;
- old/duplicate installation detection;
- controlled reinstall preserving ownership/data;
- successful update;
- failed update followed by automatic/manual rollback;
- uninstall/legacy restoration when intentionally requested.

Any duplicated physical print, ownership loop, required manual login, lost copy configuration, cross-agent claim or missing rollback evidence is NO-GO for INT-15.
