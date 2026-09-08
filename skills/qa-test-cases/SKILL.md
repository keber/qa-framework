---
name: qa-test-cases
description: >
  Stage 4 of the QA pipeline. Expands or completes the test case steps in an
  existing Plan de Pruebas document (from Stage 3). Use when: the Plan de Pruebas
  was generated with summary steps that need to be expanded into concrete,
  observable UI steps; or when standalone TC-*.md files are needed for complex
  or reusable test cases. Use when asked to expand steps, complete test cases,
  detail test procedures, or write standalone TC-*.md files.
  Requires a Plan de Pruebas (Stage 3) for the target module/sprint.
---

# QA Skill: Test Case Step Expansion (Stage 4 of 6)

**Stage**: 4 - Test Case Steps (expand / complete Plan de Pruebas)
**Prerequisite**: Plan de Pruebas exists at `qa/02-test-plans/sprints/Sprint-{N}/Plan-de-Pruebas-{proyecto}-Sprint-{N}-{modulo}.md`
**Output**: Updated Plan de Pruebas table (primary) OR `qa/03-test-cases/TC-{ID}.md` files (standalone, optional)
**Next stage**: Stage 5 - Automation (`qa-automation`) or ADO Integration (`qa-ado-integration`)

> **Pipeline rule**: TC IDs must be unique across the module. Never reuse a TC ID.
> **Primary output** is the table in the Plan de Pruebas, not standalone files.

---

## When to use this skill

| Situation | Action |
|-----------|--------|
| Plan de Pruebas has summary steps (from `05-test-scenarios.md`) that aren't concrete enough | Expand steps row by row in the table |
| A specific TC requires multi-scenario, multi-role documentation | Create standalone `TC-{ID}.md` in `qa/03-test-cases/` |
| TC is reused across multiple sprints unchanged | Create standalone file with cross-reference |
| All steps in the table are already concrete and observable | Stage 4 not needed - proceed to Stage 5 or ADO |

---

## Inputs Required

1. `qa/02-test-plans/sprints/Sprint-{N}/Plan-de-Pruebas-{proyecto}-Sprint-{N}-{modulo}.md` - table to expand
2. `qa/01-specifications/module-{name}/submodule-{name}/00-inventory.md` - UI field names, button labels, routes
3. `qa/01-specifications/module-{name}/submodule-{name}/05-test-scenarios.md` - original scenario text

---

## Process

### Step 1 - Identify rows needing expansion

Review the Tabla de Pruebas. Flag rows where Steps are:
- Summary-level (e.g., "Navegar al módulo y verificar comportamiento")
- Missing intermediate steps (fewer than 2 steps for a non-trivial scenario)
- Using vague verbs ("hacer lo necesario", "verificar que funciona")

### Step 2 - Expand steps in-table

For each flagged row, rewrite the Steps cell using:
- `00-inventory.md` for exact UI element names and routes
- `05-test-scenarios.md` for the original intent
- Steps format: `1) Navegar a {QA_BASE_URL}/ruta<br>2) Ingresar...<br>3) Verificar que...`

Quality rules per step:
- Concrete verb: Navegar, Ingresar, Hacer click, Seleccionar, Verificar, Revisar
- One action + one verification per step (when applicable)
- Resultado Esperado must be measurable (specific text, state, count)

### Step 3 - Standalone TC files (only when needed)

If a TC requires standalone documentation (see "When to use" table above):
- Save as `qa/03-test-cases/TC-{ID}.md`
- Use template from `references/test-case-template.md`
- Add a note in the Plan de Pruebas table row: "See qa/03-test-cases/TC-{ID}.md"

### Step 4 - Quality gates

Before marking stage complete:
- [ ] Every row in the table has ≥ 2 numbered steps
- [ ] Every step uses a concrete UI verb
- [ ] Every Resultado Esperado is measurable
- [ ] No blank cells in Confirma column (Task ID or `N/A`)
- [ ] Standalone TC files (if created) are cross-referenced in the table
- [ ] Output verification run and the counts reported (see `../qa-module-analysis/references/output-verification.md`) - report the command output, never a compliance claim

---

## Key Rules

| Rule | Correct | Wrong |
|---|---|---|
| Primary output | Expand rows in Plan de Pruebas table | Create files for every TC |
| Step granularity | One action + one observable result | Multi-action vague steps |
| Data references | `{QA_USER_EMAIL}`, `EXEC_IDX`, named env var | Hardcoded credentials |
| ID stability | Never re-number existing TC-IDs | Renaming breaks ADO links |

---

## Outputs

- Updated `Plan-de-Pruebas-{proyecto}-Sprint-{N}-{modulo}.md` (rows with expanded steps)
- Optionally: `qa/03-test-cases/TC-{ID}.md` for complex/reusable TCs
