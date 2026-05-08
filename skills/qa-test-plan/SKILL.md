---
name: qa-test-plan
description: >
  Stage 3 of the QA pipeline. Generates a "Plan de Pruebas" document per sprint
  and module. The document combines test plan context (scope, strategy, preconditions)
  with a detailed test case table (steps, expected results, ADO Task reference).
  This is the primary artifact consumed by the ADO integration skill to create
  Test Suites and Test Cases with steps in Azure DevOps.
  Use when asked to create a test plan, plan a sprint, write test cases with steps,
  or produce the QA plan for a module or sprint.
  Requires completed specs (Stage 2).
---

# QA Skill: Plan de Pruebas (Stage 3 of 6)

**Stage**: 3 — Plan de Pruebas (test plan + detailed test case table)
**Prerequisite**: `05-test-scenarios.md` must exist for all in-scope submodules (Stage 2 complete)
**Output**: `qa/02-test-plans/sprints/Sprint-{N}/Plan-de-Pruebas-{proyecto}-Sprint-{N}-{modulo}.md`
**Next stage**: Stage 4 — Expand steps (`qa-test-cases`) if steps need more detail; or Stage 5 — Automation (`qa-automation`)

> **Pipeline rule**: Do not automate TCs that are not in an active Plan de Pruebas.
> **ADO rule**: The Plan de Pruebas is the source for ADO Test Cases — steps in the table become steps in ADO.

---

## Inputs Required

1. `qa/01-specifications/module-{name}/submodule-{name}/` — spec files, especially:
   - `00-inventory.md` — UI fields, buttons, routes (source for concrete step text)
   - `05-test-scenarios.md` — TC list with summary steps and expected results
2. Sprint number and module name (ask the user if not given)
3. ADO sprint tasks/stories (if available; use for "Confirma" column; `N/A` if not)
4. Project name from `qa/qa-framework.config.json` → `project.name`

---

## Process

### Step 1 — Collect TC inventory

For each in-scope submodule, read `05-test-scenarios.md` and aggregate:
- Total TC count by priority (P0/P1/P2/P3)
- TC count by type: Manual / Automatizado / Ambos
- TCs marked `BLOCKED-PERMISSIONS` or `PENDING-CODE` → include in table but mark type as `Bloqueado`

### Step 2 — Apply priority rules

Use the priority decision tree (see `references/plan-de-pruebas-template.md`):
- **P0**: happy path confirmation; show-stopper risk; data corruption
- **P1**: common negative; cross-module; state transitions; smoke E2E
- **P2**: secondary features (export, pagination, search); regression adjacent
- **P3**: edge cases; exploratory charters (timeboxed)

### Step 3 — Define TestSuites (ADO grouping)

Group TCs by functional area. Each group → one ADO Test Suite:
- 3–7 suites per module is typical
- Name suites after the functional area, not the priority (e.g., "Solicitud Individual", "Aprobación Web")
- Last suite: "Exploratoria" if there are P3 charters

### Step 4 — Write the Plan de Pruebas document

Full template: `references/plan-de-pruebas-template.md`

Required sections:
1. Header (Proyecto, Sprint, Módulo, Fecha planificación, Ventana QA, ADO Test Plan link)
2. Objetivo
3. Alcance (en alcance / fuera de alcance)
4. Items del Sprint normalizados (grouped by area; Task IDs if available)
5. Priorización (P0–P3 summary)
6. TestSuites (agrupación para ADO)
7. Precondiciones generales (ambiente, roles, datos base)
8. Datos mínimos sugeridos (table with env var references)
9. Supuestos & Faltantes críticos (TODO items before execution)
10. **Tabla de Pruebas** (see Step 4a)
11. Matriz de Trazabilidad (Task ↔ N)
12. Notas de automatización

#### Step 4a — Tabla de Pruebas (most important section)

Each row in the table is one test case. Columns:

| Column | Rules |
|--------|-------|
| **N** | Sequential number (1, 2, 3...) — used in trazabilidad matrix |
| **TC-ID** | `TC-{MODULE}-{SUB}-{NNN}` from specs; or assign sequentially if new |
| **Suite / Área Funcional** | Suite name from Step 3 |
| **Título** | `[ETIQUETA][P#] Descripción concisa` — etiquetas: CONFIRMACION, SMOKE, REGRESION, EXPLORATORIA |
| **Descripción** | What scenario this validates (1-2 sentences) |
| **Steps** | Numbered, separated by `<br>`. Use concrete UI verbs from `00-inventory.md`: "Navegar a", "Ingresar", "Hacer click en", "Verificar que", "Seleccionar". Reference env vars as `{ENV_VAR}` |
| **Resultado Esperado** | Observable outcome: specific text, state change, notification. Not vague ("works correctly") |
| **Confirma** | `Task NNNNN` if an ADO task covers this; `N/A` if no task or exploratory |
| **Tipo** | `Manual` \| `Automatizado` \| `Ambos` \| `Bloqueado` |
| **Prioridad** | `P0` \| `P1` \| `P2` \| `P3` |

**Steps quality rules**:
- Each step = one observable action + one observable verification (when applicable)
- Reference UI elements by name as seen in `00-inventory.md` (exact button label, field name)
- Reference test data by env var name (`{QA_USER_EMAIL}`) or pattern (`EXEC_IDX`)
- Exploratory charters: steps = "Timebox N min" + charter goal + "Registrar hallazgos"

### Step 5 — Update status

- Update `qa/README.md` module row (plan status → ✅)
- If ADO enabled: stub the ADO Plan ID field for the ADO integration skill

---

## Outputs

- `qa/02-test-plans/sprints/Sprint-{N}/Plan-de-Pruebas-{proyecto}-Sprint-{N}-{modulo}.md`
- Updated `qa/README.md` module status row

## Quality gates before marking complete

- [ ] All in-scope TCs from `05-test-scenarios.md` appear in the table
- [ ] Every row has at least 2 numbered steps
- [ ] Every step uses a concrete UI verb (not vague like "do the action")
- [ ] Resultado Esperado is measurable (specific text/state, not "works correctly")
- [ ] Matriz de Trazabilidad covers all Tasks mentioned in the table
- [ ] `Confirma` column has no blank cells (must be Task ID or `N/A`)


> **Pipeline rule**: Do not automate TCs that are not in an approved or active test plan.

---

## Inputs Required

1. `qa/01-specifications/module-{name}/` — all submodule specs
2. Scope definition — which submodules are in this test plan (ask the user if not given)
3. Priority guidance (from team or implied by sprint scope)

---

## Process

### Step 1 — Collect TC inventory

For each in-scope submodule, read `05-test-scenarios.md` and aggregate:
- Total TC count by priority (P0/P1/P2/P3)
- TC count by automation feasibility (fully / partially / not automatable)
- Any TCs marked `BLOCKED-PERMISSIONS` or `PENDING-CODE` (these go in the exclusion list)

### Step 2 — Apply priority rules

Use the priority decision tree (see `references/priority-and-feasibility.md`) to assign or validate priorities. Key rules:

- **P0**: primary happy path; show-stopper risk; critical data corruption
- **P1**: common negative scenarios; cross-module dependencies; state machine transitions
- **P2**: secondary features (export, pagination, search)
- **P3**: edge cases, cosmetic, rare scenarios

### Step 3 — Apply automation feasibility rules

- **Fully automatable**: deterministic, observable via browser, no external system dependency
- **Partially automatable**: some result requires human inspection OR external system can be mocked
- **Not automatable**: physical access required; inherently non-deterministic; irreversible QA side effects; BLOCKED-PERMISSIONS

### Step 4 — Write the test plan document

Full document template: `references/test-plan-template.md`

Required sections:
1. Objective
2. Scope (in/out)
3. Automation feasibility analysis table (per submodule)
4. Priority distribution table
5. TC selection suites (P0 suite, P1 suite)
6. Azure DevOps mapping (if ADO enabled)
7. Test environment
8. Risks and assumptions
9. Excluded TCs (with reason)
10. Execution schedule

### Step 5 — Update status

- Update `qa/README.md` module row (plan status → ✅)
- If ADO enabled: stub the ADO Plan ID field for Step 6 (ADO integration)

---

## Outputs

- `qa/02-test-plans/automated/{module}-test-plan.md`
- `qa/README.md` plan status updated
