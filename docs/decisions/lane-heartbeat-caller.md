# Decision: the dispatcher calls the lane heartbeat, not the executor

**Status**: accepted, implemented for Claude Code (2026-11-11) - see "Implementation" below
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

## Implementation (2026-11-11)

**Where.** `templates/qa-framework.rules.md`, installed as `.claude/rules/qa-framework.md`:
rule 12 (the agent-agnostic requirement, same number and title as rule 12 of
`qa-framework.instructions.md`) and the section "Lane lock - Claude Code dispatcher
protocol". Until then the Claude Code rules file did not mention lanes at all, and
Claude Code does not read `.github/instructions/`, so Claude Code projects received the
sweep with no rule naming who keeps a lane alive. `upgrade` overwrites that file as
framework-owned, so existing projects get it too. Guarded by `test/claude-rules.test.js`.

**What.** The dispatcher starts a background "heartbeat pump" before launching the worker.
The pump checks that the lane holder is still the dispatcher's `request_id`, calls
`heartbeat` every `min(5 min, QA_LANE_STALE_MINUTES / 4)` and exits after about 20
minutes. Its exit re-invokes the dispatcher, which renews it only while the worker's
output keeps growing; after two leases without growth it stops the worker with `TaskStop`
and releases the lane. That is the answer to a completion notification that never
arrives: the lane cannot be held indefinitely, and it is not swept under a live worker
because the dispatcher stops the worker before letting the pump lapse.

**Deviation from the mechanism named under Layering.** That section describes a `/loop`
wrapper with a `ScheduleWakeup` fallback and a non-blocking task-state check. Checked
against Claude Code 2.1.312 and its documentation on 2026-11-11:

- `TaskOutput(task_id, block:false)`, which the consumer projects' local rules use, was
  removed in v2.1.277. There is no documented non-blocking task-state tool; the
  protocol uses the size and modification time of the task's output file instead.
- `/loop` and `ScheduleWakeup` exist, but scheduled wakeups fire only between turns, so a
  dispatcher busy on a long turn misses them. A background command keeps beating
  regardless, re-invokes the dispatcher when it exits, and is cleaned up when the
  session exits, so a dead dispatcher can never keep a lane alive.

The decision itself is unchanged: the dispatcher calls `heartbeat` from its own wait
loop, and the loop is now the pump plus its lease check-ins.

**Left out.**

- `heartbeat` and `release` in `lane-lock.js` do not check the holder. After a sweep and a
  re-acquisition by someone else, a bare `heartbeat` succeeds on the new holder's lane
  and a late `release` frees it. The protocol works around it by comparing the holder
  with the recorded `request_id` through `status`; fixing the script itself (an optional
  `request_id` argument) is pending.
- `templates/agents/qa-investigador.md` still tells that worker heartbeats are
  mandatory. It is harmless redundancy under this decision, but its wording contradicts
  "the executor is not required to call it".
- Mechanisms for other agents (Copilot, OpenCode) are not written; each agent's
  adaptation defines its own.
