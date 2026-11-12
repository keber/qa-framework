# QA Framework Instructions

This project uses `@keber/qa-framework` v{{VERSION}} for spec-driven automated testing.

## Agent behavior rules

0. **On every conversation start:** check if `qa/AGENT-NEXT-STEPS.md` exists. If it does, read it and complete its steps before anything else.
1. Before performing any QA task, run the corresponding `/qa-{name}` command (see `.claude/commands/`), which loads the relevant skill via `.github/skills/qa-{name}/SKILL.md`. For project context, read `qa/memory/INDEX.md` if it exists, then load only the memory files relevant to the current task - do not load all memory files unconditionally. Never execute a pipeline stage unless its prerequisite is satisfied.
2. Always save artifacts in the correct `qa/` subfolder - refer to `qa/QA-STRUCTURE-GUIDE.md`
3. Never hardcode credentials - always use env vars and `<PLACEHOLDER>` in documentation
4. Follow the naming conventions in `qa/00-standards/naming-conventions.md`
5. Read previous test suites code in `qa/07-automation/e2e/tests/` if available before writing new automation to maintain consistency in style and approach
6. Project QA config is at `qa/qa-framework.config.json`
7. Save learnings in `qa/memory/` with proper naming and metadata. Always update `qa/memory/INDEX.md` after adding or updating any memory file.
8. **Sprint/module completion criteria:** A sprint or module is complete when every TC in scope has one of these three valid states - and no other: (a) `test()` passing: the app meets the spec; (b) `test.fail()`: the app violates the spec **and** a file `qa/06-defects/open/DEF-{PREFIX}-NNN_*.md` exists documenting which business rule is violated and what the app actually does; (c) `test.skip()`: the TC is not yet executable, annotated with `PENDING-CODE` and a linked issue. A sprint is **not** complete if any TC is failing without `test.fail()`, or has `test.fail()` without a defect file, or has `test.skip()` without a `PENDING-CODE` reason.
9. **On sprint/module completion:** (1) update the module status row in `qa/README.md`; (2) move the completed sprint checklist from `AGENT-NEXT-STEPS.md` to the `## Sprint History` section of `qa/README.md`; (3) trim `AGENT-NEXT-STEPS.md` so it contains only the next sprint - never let it accumulate more than one active sprint.
10. **Assertion polarity rule (BLOCKING):** A test must assert what the **spec** requires, not what the app currently does. If the app fails to meet the spec, use `test.fail()` + correct assertion to document the defect - **never invert or weaken an assertion to make a test go green.** A failing test that exposes a real defect is always more valuable than a passing test that hides one.
11. **Character encoding safety (BLOCKING):** In ALL generated content (markdown, scripts, test titles, ADO fields, config files), never use characters at these Unicode code points: em-dash (U+2014), en-dash (U+2013), horizontal ellipsis (U+2026), smart/curly quotes (U+201C, U+201D, U+2018, U+2019), or directional arrows (U+2190-U+21FF). Use ASCII equivalents instead: ` - ` (hyphen with surrounding spaces) for dashes, `...` for ellipsis, `"` and `'` for quotes, `->` and `<-` for arrows. Exception: Latin Extended characters (U+00C0-U+024F) are always permitted - this covers Spanish vowels with accents (U+00E0-U+00FA), n with tilde (U+00F1/U+00D1), and u/o with umlaut (U+00FC/U+00DC, U+00F6/U+00D6).
12. **Lane lock for parallel QA execution (BLOCKING):** Parallel QA lanes exist because the applications under test invalidate a session when the same account logs in again - two concurrent workers on one account silently destroy each other's session, and the damage surfaces later as an unexplained logout or as evidence recorded under the wrong account. Before dispatching any worker (sub-agent, test runner project, or CI job) against one of the lanes configured in `parallelLanes.lanes` in `qa/qa-framework.config.json`, **acquire a lane through the project's lane-lock script and release it when the work is done.** Never assign a lane by prompt or config alone without going through the lock. Use `acquire` when the worker does not care which lane it gets, and `reserve <laneId>` when it needs a specific predictable lane (a CI job or a local CLI run). If no lane is free, queue (capped at the configured lane count) or reject - **never force a lane assignment past that cap.** Check that a lane actually has the capability a worker needs before handing it over. A held lane is swept as stale only after the configured threshold and only when no recent heartbeat proves the holder alive, so **the dispatcher must keep the lane alive with `heartbeat` while the work is in flight** - do not rely on the dispatched worker to do it. The Claude Code mechanism, how to verify a held lane and how to clear an orphaned one are defined in "Lane lock - Claude Code dispatcher protocol" below.

## Lane lock - Claude Code dispatcher protocol

Applies to every dispatch against a lane in `parallelLanes.lanes`. The **dispatcher** is whichever agent runs the lock commands: the main conversation, or a sub-agent that itself dispatches workers. Run every command from the project root. `<S>` below is `qa/07-automation/e2e/scripts/lane-lock.js`. Rationale: `docs/decisions/lane-heartbeat-caller.md` in `@keber/qa-framework`.

### Before dispatching

1. Run `node <S>` with no arguments once and confirm `heartbeat` is in its usage. If it is not, the project's lane-lock predates heartbeat: do not dispatch work that can run longer than `QA_LANE_STALE_MINUTES`; report it instead.
2. `node <S> acquire "<label>"` (or `reserve <laneId> "<label>"`). Use a label that names the owner and the work, such as `"<branch>:<task>"`, so anyone reading `status` later can find the owner. Record `lane` and `request_id` from the output. When you work from a git worktree, check the `locks dir:` line on stderr points at the shared `QA_LANE_LOCKS_DIR`, not at a per-checkout default.
3. If the result is `queued` or `rejected`, do not dispatch.
4. Start the heartbeat pump (next section) as a background Bash command (`run_in_background: true`) and record its task id. Start it BEFORE the worker.
5. Launch the worker in the background (a sub-agent, or a Bash command with `run_in_background: true` for a test run) and record its task id and the output file path its launch result gives. Never dispatch a lane worker as a blocking foreground call.

### The heartbeat pump

The dispatcher calls `heartbeat` itself, from a background command it owns; the worker is never relied upon for it. Replace `<lane>` and `<request_id>`:

```bash
L='<lane>'; ID='<request_id>'; S=qa/07-automation/e2e/scripts/lane-lock.js
T=${QA_LANE_STALE_MINUTES:-20}; H=$(( T * 60 / 4 )); [ "$H" -gt 300 ] && H=300
[ "$H" -lt 60 ] && { echo "PUMP-ABORT stale threshold ${T}m is too low for a safe heartbeat"; exit 2; }
N=$(( 1200 / H )); i=0
while :; do
  node "$S" status 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const l=JSON.parse(s).lanes.find(x=>String(x.lane)===process.argv[1]);process.exit(l&&l.holder===process.argv[2]?0:1)})' "$L" "$ID" || { echo "PUMP-LOST lane $L is no longer held by $ID"; exit 3; }
  node "$S" heartbeat "$L" >/dev/null 2>&1 || { echo "PUMP-LOST heartbeat failed on lane $L"; exit 3; }
  [ "$i" -ge "$N" ] && { echo "PUMP-LEASE-END lane $L"; exit 0; }
  i=$((i+1)); sleep "$H"
done
```

- **Interval:** `min(5 minutes, QA_LANE_STALE_MINUTES / 4)`. With the default threshold of 20 that is every 5 minutes: three consecutive heartbeats can be late or lost before the lane becomes sweepable. If a project raises the threshold the interval stays at 5 minutes; if it lowers it the interval shrinks with it. Below 4 minutes the pump refuses to start (`PUMP-ABORT`): raise the threshold. `lane-lock.js` reads `QA_LANE_STALE_MINUTES` from the shell environment only, not from `.env`, and the sweep runs in whichever process calls `acquire`, `reserve` or `status` with ITS threshold - so every process that touches the lock must share the same value.
- **Holder check:** `heartbeat` and `release` do not check who holds the lane. If the lane was swept and handed to someone else, a bare `heartbeat` would succeed on their lane. The pump compares the holder with your `request_id` first and stops with `PUMP-LOST` otherwise.
- **Lease:** the pump runs about 20 minutes, heartbeats one last time and exits with `PUMP-LEASE-END`. A background command re-invokes the dispatcher when it exits, so the lease end is the dispatcher's wait loop: a forced check-in every 20 minutes that only the dispatcher can renew. After the last heartbeat the dispatcher still has `QA_LANE_STALE_MINUTES` to renew.
- **Why not `/loop` with `ScheduleWakeup`:** scheduled wakeups fire only between turns, so a dispatcher busy on a long turn misses them. The background pump keeps beating regardless, and background commands are cleaned up when the session exits, so a dead dispatcher can never keep a lane alive.

### Check-in at each PUMP-LEASE-END

Read the size and modification time of the worker's output file (`stat`, never read the file whole) and compare with the previous check-in:

- It grew: start a new pump with the same lane and `request_id`.
- It did not grow: start one more pump and tell the user the worker looks idle.
- It did not grow across two consecutive leases (about 40 minutes): the worker is hung or finished without a notification. Stop it with `TaskStop` and its task id, then run "End of work". Never let the last pump expire under a worker you have not stopped.
- Lane held longer than 60 minutes or the application's session TTL: say so to the user at every renewal. A long hold is a signal to verify, not a defect to ignore.

### End of work - always

On the worker's completion notification, whatever the outcome (success, failure, error, or stopped):

1. Stop the pump with `TaskStop`.
2. `node <S> status` and confirm the lane's `holder` is still your `request_id`.
3. If it is, `node <S> release <lane>`. If it is not, do NOT release (the lane belongs to someone else now) and report it as in "PUMP-LOST".

Release before you report the worker's results. A failed worker is not a reason to skip the release.

### When the completion notification never arrives

Nothing else is needed: the pump's lease end still wakes the dispatcher every 20 minutes, a finished worker's output stops growing, and the check-in rule stops the worker and releases the lane within two leases. The lane is never held indefinitely, because nothing renews the pump except a dispatcher check-in, and it is never swept under a live worker, because the dispatcher stops the worker before it lets the pump lapse.

### PUMP-LOST

The lane was swept or released while your worker was running: another worker may already be on that account. Stop the worker immediately with `TaskStop`, do not release the lane, do not re-acquire it for the same worker, and report to the user with the matching entry of `stale-lane-alerts.log` in the locks dir. Treat any evidence the worker produced after its last successful heartbeat as suspect.

### Verifying a held lane

`node <S> status` lists every lane with `holder`, `label`, `age_minutes`, `last_heartbeat` and `stale`. A lane is legitimately held when its holder is a `request_id` you recorded for a worker that is still running (or its label names another live session or job), and its `last_heartbeat` is younger than the threshold. A large `age_minutes` with a fresh `last_heartbeat` is a live holder, not an orphan.

### Clearing an orphaned lane

1. `stale: true`: the lane is already sweepable. Running `status` sweeps it and logs it to `stale-lane-alerts.log`. No force needed.
2. `stale: false` with a recent heartbeat: someone is keeping it alive. It is not an orphan; find the owner from the label and never force it.
3. The holder is a `request_id` of yours and its worker is stopped or finished: `node <S> release <lane>`.
4. `node <S> force-release <lane>` only when the user confirms nobody is driving that account and waiting for the sweep is not acceptable. It does not check the holder, so double-check the lane id.

### What travels in the worker prompt

- The lane id, the NAME of its account env var (never the value), and that lane's `storageState` and MCP namespace only.
- Rules 3, 10 and 11 of this file.
- Use only this lane's account and browser tools; never log in with another lane's account; never acquire, reserve, release or force-release a lane.
- If the session is invalidated (unexpected logout, a cascade of 401 after a valid login), stop and report instead of re-authenticating on another account.
- Lane liveness is the dispatcher's job: do not put the worker in charge of it. A worker that also sends heartbeats (some project agents do) is harmless redundancy that the dispatcher never counts on.
- If the worker will itself dispatch workers against lanes, it becomes a dispatcher: include this whole section in its prompt.

## Formatting rules for generated content
1. Generate the output in `UTF-8` encoding without BOM (`UTF-8`, no signature).
2. Ensure the raw output is `UTF-8` encoded with no `EF BB BF` bytes at the beginning.

## Azure DevOps integration

Before any ADO operation, check if `.github/skills/ado-qa/` exists or if
`integrations.azureDevOps.enabled` is `true` in `qa/qa-framework.config.json`. If either
condition is met, run `/qa-ado-integration` (see `.claude/commands/`), which loads
`.github/skills/qa-ado-integration/SKILL.md`, and use it for all ADO interactions
(work items, test plans, test cases, bugs, etc.).

> To enable Azure DevOps integration run: `npm install github:keber/ado-qa`

## QA Pipeline

Stages must run in order. Never start a stage unless its prerequisite is met.

| Stage | Task | Command | Prerequisite |
|---|---|---|---|
| 1 | Analyze module | `/qa-module-analysis` | None |
| 2 | Generate specifications | `/qa-spec-generation` | 00-inventory.md exists |
| 3 | Generate test plan | `/qa-test-plan` | 05-test-scenarios.md exists |
| 4 | Generate test cases | `/qa-test-cases` | Test plan exists |
| 5 | Generate automation | `/qa-automation` | Specs approved, no PENDING-CODE |
| 5b | Stabilize failing tests | `/qa-test-stabilization` | Failing tests exist |
| 6 | Maintenance | `/qa-maintenance` | Application change delivered |
| - | ADO integration | `/qa-ado-integration` | ADO enabled in config |

Each command reads its full skill from `.github/skills/qa-{name}/SKILL.md` before acting - see `.claude/commands/` for the generated wrappers.

## Project KB
1. `qa/README.md`          - The Living Index: module status, sprint history, blockers, quick-start commands.
2. `qa/memory/INDEX.md`    - Index of all memory files; load this before selecting which files to read.
