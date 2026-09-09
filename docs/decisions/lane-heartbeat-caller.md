# Decision: the dispatcher calls the lane heartbeat, not the executor

**Status**: accepted, not implemented
**Date**: 2026-09-08
**Scope**: the N-lane work still pending upstream (FRAMEWORK-FIXES v3 items 1-4, v5 items 1, 2, 4)

---

## Context

Parallel QA lanes exist to work around a constraint of the applications under test:
one account cannot hold two sessions at once, so a second login silently invalidates
the first. A lane lock assigns each concurrent worker its own account.

A lock is only useful if a held lane stays held. The reference implementation
(`lane-lock.js` in the Sispro Exportadora project) frees a lane when it looks stale,
using a composite predicate: the acquisition is older than 20 minutes AND either no
heartbeat was ever sent OR the last heartbeat is itself older than 20 minutes. A
recent heartbeat proves the holder is alive, so the lane is never swept.

That predicate is only as good as whoever calls `heartbeat`.

## The incident that forced the decision

On 2026-08-22 a delegated sub-agent spent over 20 minutes on a legitimate live
investigation - genuine environment congestion, 80 to 90 concurrent browser and node
processes - and never called `heartbeat`. The sweep did exactly what it was written
to do and freed the lane while the sub-agent was still driving that account: the
precise scenario the heartbeat exists to prevent.

No cross-session collision followed, but only because a person noticed the lane was
free with no matching completion report, paused the sub-agent, confirmed by explicit
reply that nothing had run against the browser after the sweep, and re-reserved the
lane. The protection failed by design and was caught by attentiveness.

## Decision

**The dispatcher calls `heartbeat` from its own wait loop.** The executor is not
required to call it and must not be relied upon to.

## Why

The executor option fails for a structural reason, not a discipline one. A delegated
agent has no reason to discover `heartbeat` unless the dispatching prompt tells it,
every single time. That is the same failure this project has now recorded four times
over: a known-issues record that existed and was not consulted, an orthography rule
that was asserted rather than measured, and this heartbeat. A mechanism whose
protection depends on correctly instructing an uninstructed party is not a control.

The dispatcher, by contrast, already knows whether the task is still running - it can
query task state directly. The executor cannot see how long it has been between its
own tool calls. Putting the call where the knowledge already is removes the
instruction step entirely, which is where option 1 actually broke.

The cost is real and accepted: the dispatcher's wait loop becomes more complex, and
the concrete implementation is agent-specific rather than framework-generic.

## Layering

This follows the split established in FRAMEWORK-FIXES v3 section 5.

The agent-agnostic framework states the requirement: a lane must be acquired through
the lock before any worker is dispatched against it, released when the work ends, and
kept alive by the dispatcher while the work is in flight. Each agent's adaptation
prescribes the mechanism. For Claude Code that means a `/loop` wrapper with a
`ScheduleWakeup` fallback and a non-blocking task-state check - primitives that have
no equivalent in other agents, and so must not be written into
`templates/qa-framework.instructions.md`.

## Consequences

- The N-lane scaffold ships `heartbeat` together with the rule naming its caller.
  Shipping the sweep without that answer reproduces the 2026-08-22 incident in every
  project that adopts it.
- A lane held far longer than the application's session TTL is a signal to verify,
  not a defect to ignore. Each project's agent-specific instructions must define how
  it verifies a lock is still legitimately held and how it clears a stale one.
- Neither option was implemented in the originating project, so there is no verified
  reference implementation of the dispatcher-side loop to lift. It has to be written.

## Sources

- `temp/FRAMEWORK-FIXES-qa-framework-v5.md` item 5, which framed the fork and
  recommended this side.
- `temp/FRAMEWORK-FIXES-qa-framework-v3.md` section 5, for the agent-agnostic versus
  agent-specific split.
