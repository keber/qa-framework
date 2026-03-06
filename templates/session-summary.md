# Session Summary — {{SESSION_TITLE}}

**Date**: YYYY-MM-DD
**Session type**: Module Analysis / Spec Generation / Test Plan / Automation / ADO Sync / Maintenance
**Agent instruction used**: `agent-instructions/0{{N}}-{{name}}.md`
**Module / Submodule**: {{MODULE_NAME}} / {{SUBMODULE_NAME}} (or "N/A")
**Duration**: ~{{N}} minutes

---

## Objective

{{1-2 sentences describing what this session aimed to accomplish}}

---

## Completed

| Item | Output file | Status |
|------|-------------|--------|
| {{artifact type}} | `{{relative/path/to/file}}` | ✅ Done |
| {{artifact type}} | `{{relative/path/to/file}}` | ✅ Done |

---

## Decisions Made

| Decision | Chosen option | Rationale |
|----------|--------------|-----------|
| {{e.g., "TC priority assignment for..."}} | P{{N}} | {{reason}} |
| {{e.g., "Skip automation for..."}} | Not automated | {{reason (external system, PDF, etc.)}} |

---

## Open Items for Next Session

| Item | Priority | Notes |
|------|----------|-------|
| {{task}} | High / Medium / Low | {{context}} |

---

## Defects Discovered

| DEF-ID | Title | Severity | File opened? |
|--------|-------|----------|--------------|
| DEF-{{NNN}} | {{title}} | {{severity}} | Yes — `qa/06-defects/open/DEF-{{NNN}}.md` |

---

## Files Modified

| Path | Action |
|------|--------|
| `{{path}}` | Created / Updated |

---

## Continuation Prompt

To resume this work in a new session, use:

```
Using keber/qa-framework agent instructions (agent-instructions/0{{N}}-{{name}}.md),
continue working on {{MODULE_NAME}} > {{SUBMODULE_NAME}}.

Last completed: {{last artifact}}
Next step: {{next specific task}}

Relevant files:
- {{file 1}}
- {{file 2}}
```
