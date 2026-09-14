# Printing baseline and professional-agent dependency

Status at INT-01: production operational; local Windows lifecycle provisional.
No runtime or production configuration is changed by this document.

## Canonical server path

- `PrintQueueService.authenticateAgent` validates the agent-specific token hash.
- `print_agent_claim_internal` requeues expired leases, claims eligible jobs for
  the assigned active agent and records `claimed_by_agent_id` with a 90-second
  lease.
- The service resolves printer, store preferences and sanitized external-order
  presentation, freezes rendered content and preserves configured `copies`.
- `print_agent_ack_internal` accepts only the owning processing agent, marks the
  job printed and clears ownership/lease.
- `print_agent_fail_internal` rejects non-owners (`job not owned by agent`) and
  applies retry/failure policy while clearing ownership when appropriate.
- `print_agent_heartbeat_internal` records version, capabilities, discovered
  printers and health. API routes expose authenticated config, claim, ACK, fail,
  heartbeat, order alerts and job style.

`print_jobs` is the durable queue, not an order state machine. Printing failure
must never change canonical order/payment/production/fulfillment state.

## Local agent path

`print-agent/src/index.mjs` polls claim, prints through network ESC/POS or the
Windows RAW spooler, and persists local spool state before/after the physical
side effect. `printed_unacked` is recovered by retrying ACK without reprinting.
Unreported failure is also retained locally. Physical delivery remains
at-least-once at the unavoidable printer/OS boundary; manual reprints are marked
and audited.

Current version `0.7.2` reports heartbeat/capabilities and checks the versioned
`manifest.json`. `updater.mjs` stages files, verifies SHA-256 entries and replaces
the install atomically enough to retain the current version on update failure.

## Current Windows install and recovery

The assisted `.cmd` installer:

1. obtains elevation and installs/downloads the runtime and agent;
2. writes a token-scoped `run.cmd` watchdog and hidden `launch.vbs`;
3. applies SID-based ACLs;
4. creates `schtasks /SC ONSTART /RU SYSTEM /RL HIGHEST`;
5. falls back to the system `StartUp` folder if task creation is blocked;
6. validates the local process and authenticated `/api/print-agent/config` call.

This mechanism must remain available to productive computers until a replacement
is homologated. The earlier test expectation for PowerShell ScheduledTask under
`LOCAL SERVICE` was stale and is aligned to this source-level baseline in INT-01.

## Configuration and protected behavior

- printer discovery and authenticated heartbeat;
- 58/80 mm, text size and line spacing;
- category/item layout and configured copy count, including two copies;
- routing by station/printer;
- idempotent setup test and safe retry/reprint paths;
- external-order snapshots sanitized before rendering;
- no cleanup of other applications' Windows spool jobs.

## Known production debt

Transitions/reinstalls have produced high volumes of `job not owned by agent`,
consistent with competing or stale agent identities/processes. Do not weaken the
ownership check to hide this symptom.

Before #1066, the professional agent must provide:

- Windows Service (SCM) or equivalent managed lifecycle;
- guaranteed single instance per installation/agent;
- stable persisted identity and no stale concurrent agents;
- claim-to-ACK/fail ownership continuity;
- durable spool/ACK recovery with zero recovery reprint;
- crash/reboot/logout recovery;
- atomic versioned update and rollback;
- explicit heartbeat/version and ownership diagnostics;
- controlled uninstall/reinstall that removes competing tasks/processes;
- preservation of copies and store configuration.

Acceptance covers reboot without login, user changes, network loss around the
physical print, crash during claim/print/ACK, update/rollback, old/new-agent
competition, bounded ownership errors, two-copy output, zero ACK-recovery
reprints and diagnosis split across app/backend/network/device/local agent.
