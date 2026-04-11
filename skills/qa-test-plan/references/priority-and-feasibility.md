# Reference: Test Plan Template

> Loaded by `skills/qa-test-plan/` when generating a test plan document.

---

## Complete Test Plan Template

Create at: `qa/02-test-plans/automated/{module}-test-plan.md`

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

### Out of scope
- {what is explicitly excluded and why}

---

## 3. Automation Feasibility Analysis

| Submodule | Total TCs | Fully automatable | Partially | Not automatable | Reason for exclusions |
|-----------|-----------|------------------|-----------|-----------------|----------------------|
| {name} | {N} | {N} ({%}) | {N} ({%}) | {N} ({%}) | {brief reason} |

---

## 4. Priority Distribution

| Priority | TCs selected | Automated | Manual |
|----------|-------------|-----------|--------|
| P0 (Critical — every build) | {N} | {N} | {N} |
| P1 (High — every release) | {N} | {N} | {N} |
| P2 (Medium — periodic regression) | {N} | {N} | {N} |
| P3 (Low — manual only) | {N} | 0 | {N} |

---

## 5. TC Selection and Automation Plan

### P0 Suite

| TC ID | Title | Type | Automation status |
|-------|-------|------|------------------|
| TC-{M}-{S}-001 | {title} | Functional | Queued |

### P1 Suite

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

---

## 7. Test Environment

| Item | Value |
|------|-------|
| QA URL | {{QA_BASE_URL}} |
| Browser | Chromium (Playwright) |
| Workers (local) | {N} |
| Workers (CI) | {N} |

---

## 8. Risks and Assumptions

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Unstable QA data | Medium | High | Use EXEC_IDX-generated data |
| External service unavailable | High | Medium | Use intercept / mock strategy |

---

## 9. Excluded TCs

| TC ID | Reason for exclusion |
|-------|---------------------|
| TC-{M}-{S}-NNN | `BLOCKED-PERMISSIONS` |
| TC-{M}-{S}-NNN | `PENDING-CODE` |

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

## Priority Decision Tree

```
Primary happy path of the feature?
  YES → P0
Critical data corruption or show-stopper risk?
  YES → P0
Common negative scenario (empty required field, duplicate)?
  YES → P1
Cross-module dependency or state machine transition?
  YES → P1
Secondary feature (export, pagination, search)?
  YES → P2
Edge case, cosmetic, or low-frequency scenario?
  YES → P3
```

---

## Automation Feasibility Criteria

| Feasibility | Criteria |
|---|---|
| Fully automatable | Deterministic, observable via browser, no external system dependency |
| Partially automatable | External system can be mocked, or some step requires human inspection |
| Not automatable | Physical access required; irreversible side effects; non-deterministic; BLOCKED-PERMISSIONS |
