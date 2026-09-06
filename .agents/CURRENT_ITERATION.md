# Current Iteration

## Active milestone

**M14 — Intentional Study Sessions**

State: **implemented on `master` and verified**.

## Product outcome

Workspace study time is controlled by explicit user intent rather than inferred browser activity.

```text
IDLE
 ↓ Start
RUNNING
 ↓ Pause
PAUSED
 ↓ Resume
RUNNING
 ↓ End
ENDED
```

A workspace may record multiple completed sessions on the same day. `Today`, weekly activity, streaks, and lifetime totals derive from the durable session ledger.

## Implemented behavior

- Opening a Workspace no longer auto-starts study tracking.
- Tab visibility, focus, pointer/input activity, and idle detection no longer auto-pause or auto-resume study tracking.
- Leaving/reloading a Workspace no longer auto-ends the logical session.
- Start creates a new manual logical session.
- Pause freezes elapsed time without completing the session.
- Resume continues the same logical session.
- End explicitly completes the session and returns the Workspace timer to idle.
- Multiple Start → End cycles on the same date remain separate durable study records and aggregate into that day's total.
- An active logical session survives reload/navigation through local session state rather than becoming a hidden implicit End.
- A running session that crosses local midnight remains one logical user session while persistence is split into per-date segments so daily totals remain correct.
- The compact Workspace header exposes Start, Pause/Resume, and End directly; the activity popover remains the summary surface for Current session, Today, and Total.

## Engineering scope

The existing study API and SQLite schema were reused. No migration, backend contract change, new dependency, global state library, or deployment change was required.

The browser feature now owns the manual lifecycle and uses the existing monotonic `active_seconds` heartbeat boundary for durable per-date segments.

## Verification evidence

Runtime implementation head: `4c63571866501ca49b2d3a20933bad9f589c2d07`.

GitHub Actions `Verify` run **#138** passed on that runtime head:

- TypeScript typecheck — pass;
- ESLint — pass;
- web unit tests — pass;
- production web build — pass;
- repository knowledge contract — pass.

Backend and production-composition gates were correctly skipped because this change did not modify their boundaries.

Focused study-timer unit coverage proves:

- running time accumulates only while the logical session is running;
- Pause freezes elapsed time and Resume continues the same session;
- midnight splits persistence by local date without resetting the logical session total;
- Today and Total can aggregate different portions of a cross-day session;
- negative counters remain clamped.

## Remaining material gap

None for the requested manual Start / Pause / Resume / End behavior.

## Next action

**STOP.** Reassess only when a new user-visible study requirement is explicitly requested.
