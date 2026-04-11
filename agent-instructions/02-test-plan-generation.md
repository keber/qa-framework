# Agent Instructions: Test Plan Generation

> ⚠️ **DEPRECATED**: This file is superseded by `.github/skills/qa-test-plan/SKILL.md`.
> Kept as reference during the transition period. Do not update this file.

**File**: `agent-instructions/02-test-plan-generation.md`  
**Purpose**: Instructions for generating a test plan document for a module, after its spec set is complete.

---

## When to use

- After all submodule specs (`05-test-scenarios.md`) are written and reviewed
- When preparing for a sprint or release
- When deciding which TCs to automate vs test manually

---

## Inputs Required

1. `qa/01-specifications/module-{name}/` — all submodule specs
2. Scope definition: which submodules are in this test plan
3. Priority guidance (from the team or implied by sprint scope)

---

## Test Plan Document Structure

Create: `qa/02-test-plans/automated/{module}-test-plan.md`

```markdown
# Test Plan: {Module Display Name}

| Field | Value |
|-------|-------|
| Version | 1.0 |
| Date | YYYY-MM-DD |
| Module | {module-code} |
| Test plan type | Automated / Manual / Combined |
| Author | {agent or human name} |
| Status | Draft / Approved / Active |

---

## 1. Objective

{1-2 sentences: what this test plan covers and why}

---

## 2. Scope

### In scope
- {submodule 1}: {what is being tested}
- {submodule 2}: {what is being tested}

### Out of scope
- {what is explicitly excluded and why}

---

## 3. Automation Feasibility Analysis

| Submodule | Total TCs | Fully automatable | Partially | Not automatable | Reason for exclusions |
|-----------|-----------|------------------|-----------|-----------------|----------------------|
| {name} | {N} | {N} ({%}) | {N} ({%}) | {N} ({%}) | {brief reason} |

**Definition**:
- **Fully automatable**: deterministic, observable, no external dependencies
- **Partially automatable**: some steps can be automated, others require manual verification
- **Not automatable**: requires human judgment, external system access, or is too risky to automate in QA

---

## 4. Priority Distribution

| Priority | TCs selected | Automated | Manual |
|----------|-------------|-----------|--------|
| P0 (Critical — must run every build) | {N} | {N} | {N} |
| P1 (High — must run before release) | {N} | {N} | {N} |
| P2 (Medium — periodic regression) | {N} | {N} | {N} |
| P3 (Low — manual only) | {N} | 0 | {N} |

---

## 5. TC Selection and Automation Plan

### P0 Suite — {suite name}

| TC ID | Title | Type | Automation status |
|-------|-------|------|------------------|
| TC-{M}-{S}-001 | {title} | Functional | Queued |
| TC-{M}-{S}-002 | {title} | Negative | Queued |

### P1 Suite — {suite name}

| TC ID | Title | Type | Automation status |
|-------|-------|------|------------------|
| TC-{M}-{S}-010 | {title} | Functional | Queued |

---

## 6. Azure DevOps Test Plan (if enabled)

| Item | Value |
|------|-------|
| ADO Plan ID | (populate after creation) |
| ADO Suite IDs | (populate after creation) |
| Reporter | @alex_neo/playwright-azure-reporter |
| Sync script | qa/08-azure-integration/scripts/inject-ado-ids.ps1 |

---

## 7. Test Environment

| Item | Value |
|------|-------|
| QA URL | {{QA_BASE_URL}} |
| Browser | Chromium (Playwright) |
| Workers (local) | {N from config} |
| Workers (CI) | {N from config} |
| Parallel sessions supported | Yes / No |

---

## 8. Risks and Assumptions

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Unstable QA data | Medium | High | Use EXEC_IDX-generated data |
| External service (email, etc.) not available | High | Medium | Use 3-layer validation strategy |
| QA env down-time | Low | High | Retry with 2h buffer in CI |

---

## 9. Excluded TCs

| TC ID | Reason for exclusion |
|-------|---------------------|
| TC-{M}-{S}-NNN | `BLOCKED-PERMISSIONS`: QA user cannot access |
| TC-{M}-{S}-NNN | `PENDING-CODE`: feature not yet deployed |
| TC-{M}-{S}-NNN | Not automatable: requires visual inspection / external access |

---

## 10. Execution Schedule

| Suite | Trigger | Frequency |
|-------|---------|-----------|
| P0 smoke | Every CI build | On push to main / PR |
| P1 regression | Scheduled | Nightly |
| P2 full regression | Manual trigger | Before each release |

---

## Changelog

| Version | Date | Description |
|---------|------|-------------|
| 1.0 | YYYY-MM-DD | Initial creation |
```

---

## Rules for Priority Assignment

Use this decision tree for each TC:

```
Is this the primary happy path of the feature?
├── YES → P0

Is a bug here a show-stopper or critical data corruption risk?
├── YES → P0
├── NO →
   Is this a common negative scenario (empty required field, duplicate)?
   ├── YES → P1
   Is this a cross-module dependency or state machine transition?
   ├── YES → P1
   Is this a secondary feature (export, pagination, search)?
   ├── YES → P2
   Is this an edge case, cosmetic, or low-frequency scenario?
   ├── YES → P3
```

---

## Automation Feasibility Decision Criteria

**Mark as fully automatable** when:
- All interactions are observable via browser automation
- The result is deterministic (same input → same output)
- No external systems are involved (live email server, payment gateway)
- Data can be set up programmatically

**Mark as partially automatable** when:
- Some result requires human visual inspection
- An external system is involved but can be mocked (email intercept, API stub)
- Data setup requires a manual step first

**Mark as not automatable** when:
- Requires physical access or real hardware
- Result is inherently non-deterministic (performance, visual design)
- Test would create irreversible side effects in QA environment (live invoice, real payment)
- The feature is blocked by permissions that cannot be granted to QA users
