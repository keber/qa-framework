# Test Plan — {{MODULE_NAME}}

**Plan ID**: TP-{{MODULE}}-{{VERSION}}
**Module**: {{MODULE_NAME}}
**Sprint / Release**: Sprint {{NNN}}
**Prepared by**: (agent output — reviewed by human)
**Date**: YYYY-MM-DD
**ADO Test Plan**: #{ADO_PLAN_ID} (if ADO enabled)

---

## 1. Scope

### 1.1 In scope

| Submodule | Description | Automated? |
|-----------|-------------|------------|
| {{submodule}} | {{short description}} | Yes / No / Partial |

### 1.2 Out of scope

- {{reason and submodule/feature excluded}}

---

## 2. Test Objectives

1. Validate that all business rules defined in `01-business-rules.md` are met.
2. Confirm that all user roles interact with the UI as documented in `03-roles-permissions.md`.
3. Verify all happy-path workflows defined in `02-workflows.md` pass end-to-end.
4. Detect regressions against previously stable behaviour.

---

## 3. Entry & Exit Criteria

### Entry Criteria

- [ ] Feature is deployed to QA environment
- [ ] Database is seeded with required test data (see `04-test-data.md`)
- [ ] All P0 automated tests from previous sprint pass
- [ ] Defects critical to this plan are resolved (or explicitly waived)

### Exit Criteria

- [ ] All P0 test cases pass
- [ ] ≥80% of P1 test cases pass
- [ ] No open Critical/High severity defects without accepted workaround
- [ ] Execution report delivered and signed off

---

## 4. Test Case Inventory

| TC-ID | Title | Priority | Type | Automated | Spec source |
|-------|-------|----------|------|-----------|-------------|
| TC-{{M}}-{{S}}-001 | {{title}} | P0 | Functional | Yes | `05-test-scenarios.md` |
| TC-{{M}}-{{S}}-002 | {{title}} | P1 | Functional | No | `05-test-scenarios.md` |

**Summary**:
- Total TCs: {{N}}
- P0: {{N}} | P1: {{N}} | P2: {{N}} | P3: {{N}}
- Automated: {{N}} | Manual: {{N}}

---

## 5. Automation Feasibility

| Scenario | Feasible? | Reason if not |
|----------|-----------|---------------|
| Happy path create | Yes | — |
| Export to PDF | No | Requires visual validation |
| Third-party OAuth | No | External system |

**Automation target for this plan**: {{N}} automated specs / {{N}} total automated steps

---

## 6. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| QA env unstable | Medium | High | Re-run suite; notify DevOps |
| Test data collision | Low | Medium | Use EXEC_IDX pattern |
| ADO sync failure | Low | Low | Sync manually via inject script |

---

## 7. Schedule

| Activity | Owner | Target date |
|----------|-------|-------------|
| Spec review | QA Lead | YYYY-MM-DD |
| Manual execution | QA Analyst | YYYY-MM-DD |
| Automation run | Agent / CI | YYYY-MM-DD |
| Sign-off | PM / Tech Lead | YYYY-MM-DD |

---

## 8. Dependencies

- Environment: `{{QA_BASE_URL}}`
- Test users: see `04-test-data.md §Prerequisites`
- Services: {{list any external APIs or integrations required}}

---

## 9. Defects from Previous Cycle

| DEF-ID | Title | Status | Impact on this plan |
|--------|-------|--------|---------------------|
| DEF-001 | {{title}} | Open | TC-{{M}}-{{S}}-{{NNN}} remains skipped |

---

## 10. Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| QA Lead | | | |
| Tech Lead | | | |
| Product Owner | | | |

---

## Changelog

| Version | Date | Description |
|---------|------|-------------|
| 1.0 | YYYY-MM-DD | Initial plan created |
