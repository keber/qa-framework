# Upstream candidates from consumer projects

**Date**: 2026-11-11, local date (America/Santiago, UTC-3 in effect; already 2026-11-12 in UTC)
**Target framework version**: 1.13.2 (this repo)
**Status**: point-in-time survey, not a living tracker.

> This is the inventory as of 2026-11-11. It is not kept current and its rows
> are not a to-do list: a `Pending` decision here means it was pending **on that
> date**, not that nobody has acted since. The document spawns the artifacts that
> do stay current, and should point at them rather than hold their state:
> a resolved decision becomes a record in `docs/decisions/`, and a candidate that
> moves into implementation becomes an entry in `openspec/changes/`. When the
> picture has moved enough to matter, run a new survey and supersede this one
> instead of editing it into a half-updated state.

## Purpose

This document inventories improvements built on top of the framework inside the
projects that consume it, explains how each one works, and separates what is
reusable by any project from what is project-specific. It is a decision
document, not an implementation plan. Nothing here has been ported yet.

Sections 1 to 5 cover `sispro-modular` (marcela.berriosc). Section 6 covers the
eight projects under `C:\Users\keber.flores\Proyectos` (keber.flores).

## Source projects

| Project | Path | Framework version declared |
|---|---|---|
| sispro-modular | `source\repos\sispro-modular` | 1.12.0 |
| QA_Biofruit | `Proyectos\QA_Biofruit` | 1.12.0 |
| QA_Enrolamiento | `Proyectos\QA_Enrolamiento` | 1.12.0 |
| QA_GMOIndustrial | `Proyectos\QA_GMOIndustrial` | 1.12.0 |
| QA_Nexus | `Proyectos\QA_Nexus` | pkg ^1.11.3 / config 1.10.0 |
| QA_Sispro_Exportadora | `Proyectos\QA_Sispro_Exportadora` | pkg ^1.11.3 / config 1.1.3 / CLAUDE.md 1.1.3 |
| QA_SisproModular_Exportadora | `Proyectos\QA_SisproModular_Exportadora` | pkg ^1.12.0 / rules 1.10.0 |
| ado-workitem-quality | `Proyectos\ado-workitem-quality` | not a consumer (companion) |
| qa-monitor | `Proyectos\qa-monitor` | not a consumer (unrelated) |

No project is on 1.13.2, and three carry a different version in two or three
places at once. Every candidate must be re-checked against the current framework
before porting.

## Status

| # | Candidate | Exists in framework today | Priority | Decision |
|---|---|---|---|---|
| 0 | Framework bugs found in the field (section 6A) | Bugs are live | **Blocking** | Pending |
| 1 | Write-test governance (read-only by default, write opt-in) | No | High | Pending |
| 2 | API integration scaffold + conventions | Skeleton only | High | Pending |
| 3 | `qa-performance-k6` skill (optional stage) | No | Medium | Pending |
| 4 | Execution report: two rival implementations (section 6E) | Markdown template only | Medium | Pending |
| 5 | Minor assets (vigilante, extra standards docs) | No | Low | Pending |
| 6 | Local improvements from the eight consumer projects | Mixed | High | Pending |

---

## 1. Write-test governance

### What it is

A layered guard that makes an API test project read-only by default and turns
write operations into an explicit, approved, auditable opt-in. This is the
direct answer to the meeting note "revisar reglas que permiten la ejecucion de
pruebas que escriben, no solo de lectura".

### Where it lives in the source project

```
qa/07-automation/integration/
  fixtures/base.ts                        read-only guard + escribir() gate
  fixtures/catalogo.ts                    allowlist of read endpoints
  fixtures/catalogo-escritura.ts          approved write endpoints + scope
  fixtures/catalogo-maestros-generados.ts generated, never hand-edited
  tests/escritura/                        write cycles, excluded from npm test
  escritura-candidatas.csv                candidate entities + risk column
qa/00-standards/api-testing-conventions.md  section 6c (the written rules)
```

### How it works

Four independent gates, all of which must pass before a single write request
leaves the client:

```
  test calls escribir(endpoint, body)
            |
            v
  [gate 1] API_ESCRITURA=1 present in env?            no -> throw, nothing sent
            |
            v
  [gate 2] endpoint present in catalogo-escritura.ts
           with approval (who + when) and scope in
           { aislado, sincroniza }?                   no -> throw
           scope "prohibido"                          always -> throw
            |
            v
  [gate 3] hard exclusions evaluated in base.ts,
           independent of the catalog:
           Unitec | Email/Mail | Dispatch/Despacho |
           Send* | bulk receptions                    match -> throw
            |
            v
  [gate 4] body targets a record the test itself
           created (name prefix QA-API-*),
           never a pre-existing record;
           ambiguous lookup -> test fails, does not pick
            |
            v
          request is sent
```

Gate 3 is the key design decision: the hard exclusions live in code, not in the
catalog, so adding an endpoint to the catalog cannot bypass them.

### Lifecycle of a write test

The target system has no delete, so the cycle is idempotent and reuses one test
record per entity instead of creating one per run:

```
create if absent -> reactivate -> edit (only the edited field changes)
   -> deactivate -> reject without session -> assert final state
afterAll: always leaves the record deactivated, even if a step failed
```

Cost to document per enabled entity: one deactivated `QA-API-<ENTITY>` record
left behind in the QA environment, permanently.

### Generic vs project-specific

| Reusable by any project | Specific to SISPRO |
|---|---|
| The 4-gate model and its order | The exclusion list contents (Unitec, Agrosoft) |
| `API_ESCRITURA` opt-in + separate npm script | The `QA-API-*` naming prefix (configurable) |
| Approval record (who, when, scope) in the catalog | mdm master-entity shape (Register/Edit/Vigency) |
| `aislado` / `sincroniza` / `prohibido` scope taxonomy | The 2026-10-27 approval entries |
| Idempotent create-if-absent cycle + afterAll cleanup | The candidate CSV contents |
| "Hard exclusions in code, not in config" principle | |

The exclusion list itself is project data, but the framework should ship the
mechanism plus a default deny list of categories (email, dispatch, external
system sync, file/download, bulk operations) that a project confirms or extends.

### Framework impact

- New: `templates/integration-scaffold/fixtures/base.ts` (guard), `catalogo.ts`,
  `catalogo-escritura.ts`
- New: `templates/api-testing-conventions.md` copied to `qa/00-standards/`
- New or extended: `qa-framework.config.json` write policy block (opt-in flag
  name, record prefix, deny categories)
- Extended: `skills/qa-automation/SKILL.md` or a new API skill, with the write
  rules as BLOCKING rules
- `scripts/init.js`: copy the new fixtures and the conventions doc
- `scripts/upgrade.js`: the new files are framework-owned, so they need
  overwrite entries and the usual legacy-detection care

### Open questions

- Does the deny list belong in config (editable by the project) or in code
  (not editable)? The source project chose code. Recommendation: keep it in
  code, allow the project to ADD but never REMOVE.
- Who signs the approval in a project without a named QA lead?
- Does the framework take a position on environments that DO have delete?

---

## 2. API integration scaffold and conventions

### What it is

A complete API test project (Playwright `APIRequestContext`, no browser) with a
typed endpoint catalog, an envelope contract, stable test ids, and a repeatable
endpoint-discovery procedure. Today the framework ships only the skeleton.

### Gap against this repo

| Framework 1.13.2 (`templates/integration-scaffold/`) | sispro-modular |
|---|---|
| `playwright.config.ts`, `global-setup.ts`, `.env.example` | same, adapted (no own login) |
| `tests/example.spec.ts` (one placeholder) | 586 read tests + 206 write tests |
| `README.md` (generic setup) | `README.md` + `api-testing-conventions.md` (6 sections) |
| no catalog | 3 catalogs (handwritten, generated, write) |
| no discovery tooling | 4-step discovery pipeline in `scripts/` |
| no assertion contract | standard envelope contract, verified |
| no skill | no skill either (rules live in the standards doc) |

### How it works

Session model (no token, cookie reused from the e2e project):

```
e2e project login (lane N) -> .auth/user-laneN.json
            |
            v
integration global-setup: GET api/account/status
            |
      authenticated?
       no -> tests using the `api` fixture FAIL with a renewal message
             (they are not silently skipped)
       yes -> run
```

Endpoint discovery pipeline (`scripts/`), used to go from a handwritten catalog
to broad coverage without hand-writing hundreds of tests:

```
1. explorar-pantallas.js   navigate menu screens read-only, capture gateway calls
2. clasificar-endpoints.js keep queries only; drop writes by name, ids in path
                           or body, and downloads
3. verificar-endpoints.js  call each candidate against QA (page 1, 10 rows),
                           keep status, shape and totals only
4. generar-catalogo.js     regenerate fixtures/catalogo-pantallas.ts (generated,
                           never hand-edited)
```

Result reported on 2026-10-27: 501 screens, 452 distinct endpoints, 422
candidates, 411 verified (385 listings, 26 catalogs).

Test ids are stable and derived from the route (`API-PAN-<id>`, `API-PAG-<id>`),
so adding or removing endpoints never renumbers existing tests. The handwritten
catalog uses sequential ids (`API-CAT-nnn`) with a rule: always append at the
end.

### The assertion contract

The single most transferable technical finding: in this gateway architecture a
non-existent route returns HTTP 200 with the application HTML, not 404.
Therefore no test may assert only "responds 200". Every test must assert
`Content-Type: application/json` plus the envelope:

```
{ isSucess, data, message, errors }                      // all responses
{ ..., isPartialSuccess, warnings }                      // listings add these
data: Array                                              // Select/catalog
data: { totalRecords, basePaginationResponse, items[] }  // paginated listing
no session -> HTTP 401 + JSON { isSucess: false, message }, no data
```

Note: `isSucess` is the real spelling in the API (typo upstream). Any framework
template must not silently "fix" it.

### Generic vs project-specific

| Reusable | Specific |
|---|---|
| Catalog-driven test generation | The envelope shape (SISPRO backend) |
| Stable route-derived ids vs sequential ids | Gateway path `api/gateway/<svc>/api/...` |
| 4-step discovery pipeline (as a documented method) | Cookie-only session, lane reuse |
| "Assert the spec, not today behavior" + `test.fail()` + open defect | The 200-with-HTML trap |
| Session freshness checked against the server, not file age | Timing references (10 s / 20 s) |
| Conventions doc structure | |

The envelope is project-specific, but the framework can ship it as a
configurable contract (a `fixtures/contrato.ts` the project edits once) instead
of leaving every project to invent assertions.

### Framework impact

- Extended: `templates/integration-scaffold/` with `fixtures/catalogo.ts`,
  `fixtures/base.ts`, `fixtures/contrato.ts`, `tests/` grouped by concern
  (seguridad, catalogos, listados)
- New: `skills/qa-api-integration/SKILL.md` (currently there is no skill for
  this stage at all; the rules live only in a standards doc)
- New: `templates/api-testing-conventions.md`
- Decide whether the discovery pipeline ships as code or only as documented
  method in the skill. It is browser-driven and project-shaped; shipping it as
  code may be premature.

### Open questions

- Is this a new pipeline stage, or part of stage 5 (automation)?
- Does the framework ship the discovery scripts, or only the method?

---

## 3. `qa-performance-k6` skill

### What it is

An optional pipeline stage that generates and runs a targeted k6 performance
test against named endpoints, producing a complete markdown execution report
plus the raw JSON summary. Explicitly scoped as complementary to, not a
replacement for, the broader JMeter / Azure Load Testing setup.

### How it works

```
plan JSON (plans/<tema>.plan.json)
    |
    +-- tema, baseUrl, cookieFile, stages[], thresholds{p95Ms, errorRate}
    +-- endpoints[] { tag, method, path, body }
    +-- optional: contexto[], tipoPrueba, criterios{}, outDir
    |
    v
run-perf.js runs k6, then writes in one step, with no manual save:
    qa/05-test-execution/evidencias/{fecha}-{tema}/
       k6-resultado-{tema}-{marca}.md    full report
       k6-resultado-{tema}-{marca}.json  raw k6 summary
       <copy of the plan used>
    |
    v
build-informe.js rebuilds the .md from saved .json + plan (reproducible)
```

Report contents: summary vs exit criteria, configuration, run data, per-endpoint
results (avg/p90/p95/p99/max + throughput), checks, global HTTP metrics, stated
limitations, all metrics, the plan, and the native k6 output.

### The ISTQB framing (the part worth keeping)

1. Name the test type before running: load, stress, spike, or soak. Not just
   "run k6".
2. Percentiles plus throughput, never a run summarized by its average alone.
3. Exit criteria declared before the run, not fitted to the result afterward.
   The plan `thresholds` ARE the exit criteria.
4. Baseline vs candidate framing for V1/V2 or before/after comparisons.
5. Data representativeness stated: a fast p95 over an empty dataset is not
   evidence. The report template appends this reminder automatically.
6. Client-side timing alone cannot distinguish a slow endpoint from a saturated
   server; watch server metrics for anything beyond a quick check.

### Safety rules (blocking, and fully generic)

1. `baseUrl` must point at `project.qaBaseUrl`. Never a host containing `prod`.
2. Read endpoints: safe to ramp (few VUs, 30 s ramp, 60-120 s hold).
3. Write endpoints are NOT load-tested by default: `vus: 1`, `iterations: 1`,
   a single real call for timing only. Concurrent write load requires an
   explicit request, an explicit cap, and confirmation back before running.
4. Explicit go-ahead before any run against QA, stating the lane/account used.
5. Credentials never hardcoded; session cookie from a gitignored file.

Rule 3 is the same principle as candidate 1, applied to load testing. They
should share one written policy in the framework, not two.

### Generic vs project-specific

| Reusable | Specific |
|---|---|
| Plan JSON schema | SISPRO gateway paths and bodies |
| run-perf.js / build-informe.js flow | Cookie refresh via lane-lock + load/ script |
| All 5 safety rules | The 2026-11-09 PMS V2 acceptance criteria (C1 to C5) |
| ISTQB framing and report sections | JMeter coexistence note |
| Evidence path convention | |

### Azure Load Testing (meeting note: "ver formato azure app testing")

Goal stated in the meeting: generate the artifact directly for Azure Load
Testing. Status: NOT verified. Azure Load Testing does support k6 as an engine
alongside JMeter, which makes the path plausible, but the current plan JSON is a
custom shape, not an Azure test-configuration file. Porting this candidate with
the Azure goal requires a separate spike:

- confirm the Azure Load Testing k6 support surface and its config format
- decide whether the plan JSON compiles to an Azure config, or whether the
  framework emits both from one source
- decide where the generated artifact lives (`qa/08-azure-integration/`?)

Recommendation: port the skill and its safety rules first, treat Azure emission
as a follow-up change with its own spec.

### Framework impact

- New: `skills/qa-performance-k6/SKILL.md`
- New: `templates/load-scaffold/k6/` (run-perf.js, build-informe.js, plan schema,
  `_example.plan.json`)
- Extended: pipeline table in `templates/qa-framework.instructions.md` (stage 7,
  optional, no order dependency)
- Extended: `qa-framework.config.json` (a `performance` integration block)
- `scripts/init.js` and `scripts/upgrade.js` entries

---

## 4. `qa-informe-ejecucion` skill

### What it is

Generates the test execution report as an editable Word document in the fixed
Garces Fruit QA format, with all numbers read from Azure DevOps. It explicitly
replaces the framework `qa/00-standards/execution-report-template.md` and the
`npx qa-framework generate execution-report` path.

### How it works

```
Azure DevOps (read-only, ADO_PAT from process env only)
    |
    v
collect-sprint-data.mjs --project <p> [--sprint] [--plan] --out facts.json
    |
    +--> facts.json      numbers, tables, ids, runs, dates. Never invented,
    |                    never rounded.
    |
    +--> narrativa.json  judgment: result, recommendation, version, executor.
    |                    Drafted with the user, one question at a time.
    |                    The release decision belongs to the business.
    v
build-report.mjs facts.json narrativa.json report.json
    |
    v
render-docx.mjs report.json Informe_Ejecucion_Pruebas_<App>_<Sprint>.v<N>.docx
    |
    v
verification pass: export to PDF (read-only Word COM), then pdf-to-png.mjs,
then view every page: no cut text, no orphan headings, no leftover tags,
numbers match facts.json. The PDF is deleted unless the user asked for one.
    |
    v
qa/05-test-execution/informes/
```

Key separation: facts come from the tool and are immutable; judgment comes from
the user and is explicit. The .docx is never hand-edited to change a number; it
is re-rendered from `report.json`.

### Fixed format

A4, Century Gothic, black table headers `#111111`, red `#c8102e`, green
`#1e7b34`, Garces Fruit logo. Sections in fixed order: document identification,
responsible parties, change control (v2+), report frame, 1 executive summary,
2 scope, 3 method (3.4 exit criteria), 4 test plan, 5 results (automated/manual
metrics, defects, re-verifications, 5.4 by priority, 5.5 by severity and fix
time), 6 open issues and bugs, 7 conclusion and recommendation (7.1 residual
risks), 8 scope statement, 9 cases by suite, A evidence annex.

### Hard rules worth keeping

- Output is always .docx. PDF/Markdown/HTML only as an extra copy on request.
- Every "POR CONFIRMAR" line printed by `build-report.mjs` must be resolved with
  the user before delivery.
- Never deliver "Aprobado" with a failed exit criterion without a written
  justification in the conclusion.
- Evidence images: open every one before including it. No emails, passwords,
  tokens, RUT or personal names. Crop or mask first.
- Never write to Azure DevOps. `ADO_PAT` only from the process environment.

### Generic vs project-specific

| Reusable | Specific |
|---|---|
| facts / narrativa separation | Garces Fruit brand assets and typography |
| Render-from-JSON, never hand-edit the docx | The 9-section layout |
| PDF-to-PNG visual verification pass | The reference PDF (gescontrol2 sprint 46) |
| Privacy rules for the evidence annex | Spanish section titles |
| "POR CONFIRMAR" gate before delivery | ADO project/field assumptions |
| Change control for v2+ via previous snapshot | |

This is the most company-specific candidate, but Garces Fruit is the only
consumer of this framework today, so brand assets are acceptable as long as they
are parameterized (config-driven logo path, palette, font) rather than
hardcoded.

### Framework impact and cost

- New: `skills/qa-informe-ejecucion/` with `assets/` (its own `package.json`,
  dependency on `docx`) and `references/`
- Decision needed: the framework currently ships no skill with an npm dependency
  of its own and no binary assets. This sets a precedent for package size and
  for a manual `npm install` inside a skill folder.
- Conflict to resolve: the existing `templates/execution-report.md` and the
  `generate execution-report` command. Deprecate, or keep as the fallback when
  ADO is disabled?
- Requires ADO enabled; useless without it.

### Open questions

- Is a Word renderer in scope for a methodology framework, or is this a separate
  companion package (like `@keber/ado-qa`)?
- Where do brand assets live if a second company ever uses the framework?

---

## 5. Minor assets

### `qa/07-automation/vigilante/`

A PR watcher: `vigilante-qa.js`, `listar-prs-qa-test.js`, `prompt-analisis.md`,
`registrar-tarea.ps1`, `estado.json`. Not in the meeting notes. Needs review
before deciding; it may overlap with existing maintenance tooling.

### Standards documents not present in the framework

| File in sispro `qa/00-standards/` | In framework templates? |
|---|---|
| `api-testing-conventions.md` | No (candidate 2) |
| `defect-verification.md` | No |
| `task-analysis.md` | No |
| `execution-report-template.md` | Yes (superseded by candidate 4) |
| `bug-report-template.md` | Yes (`templates/defect-report.md`) |
| `naming-conventions.md` | Yes |
| `test-case-template.md` | Yes |
| `test-data-guidelines.md` | Yes |

`defect-verification.md` and `task-analysis.md` have not been reviewed yet.

---

## 6. Local improvements from the eight consumer projects

Findings from a sweep of the eight projects under `C:\Users\keber.flores\Proyectos`
on 2026-11-11. Organised by what the finding demands, not by project, because the
same gap was independently patched in several projects.

### 6A. Framework bugs found in the field (blocking)

These are defects in the shipped package, evidenced by a consumer project. They
outrank every new feature in this document: porting more content into a package
whose upgrade path destroys user work makes the problem bigger, not smaller.

| # | Bug | Evidence | Impact |
|---|---|---|---|
| A1 | `scripts/upgrade.js` moves unrecognised folders. It relocates `qa/07-automation/e2e/lib/` and `e2e/node_modules/` into `e2e/tests/`, and flat `.md` files in `qa/02-test-plans/` into `sprints/legacy/` | `QA_GMOIndustrial\qa\memory\framework-known-issues.md`, duplicated as a warning in that project's `AGENTS.md` section 5 | **Destroys user work.** `lib/` holds the entire local automation library in QA_Enrolamiento, QA_GMOIndustrial and QA_SisproModular_Exportadora. The note says "pendiente reportarlo al repositorio del framework"; it was never filed |
| A2 | `upgrade.js` does not rewrite the `v{{VERSION}}` placeholder in `.claude/rules/qa-framework.md` and `.github/instructions/qa-framework.instructions.md` | QA_Biofruit (instructions say 1.10.0, rules say 1.12.0), QA_SisproModular_Exportadora (both say 1.10.0, package 1.12.0) | Two artefacts generated by the same scaffold disagree on the version |
| A3 | `New-AdoTestCase` does not see `$script:AdoSession` (scope issue); the session has to be passed explicitly | Documented in `QA_SisproModular_Exportadora\qa\08-azure-integration\scripts\load-suites.ps1` | The shipped ADO helper fails in a normal call pattern |
| A4 | The scaffold's `playwright.config.ts` validates `QA_USER_EMAIL` / `QA_USER_PASSWORD` at load time | `QA_SisproModular_Exportadora` replaced it: read `project.qaBaseUrl` from the manifest, and do not require credentials, because "a lane that is not being logged in must not be forced to have credentials loaded" | Breaks the framework's own parallel-lane model |
| A5 | `templates/qa-framework.instructions.md` as installed in older versions contains em-dashes (U+2014), violating rule 11 which the same file declares | `QA_Nexus\.github\instructions\qa-framework.instructions.md` (1.10.0) | Fixed in 1.13.2; listed so the regression test gets written |
| A6 | The ADO flat suite list paginates at 200; the framework's scripts do not use `?expand=children` | `QA_SisproModular_Exportadora\qa\08-azure-integration\scripts\load-suites.ps1` | Silent truncation on large test plans |

A1 is the one to fix first, and it needs a regression test, not just a patch.

### 6B. Convergent extensions (several projects patched the same gap)

When three teams independently invent the same thing, the gap belongs to the
framework. Ranked by how many projects converged.

**B1. The `Origin` / skip-state vocabulary is too small.** The framework defines
`PENDING-CODE` (plus `UI-OBSERVED` and `BLOCKED-PERMISSIONS`). Projects added:

| State added | Where | Means |
|---|---|---|
| `PENDING-BROWSER` | QA_Biofruit, QA_Enrolamiento, QA_GMOIndustrial, QA_Sispro_Exportadora (filed as v1, now upstream) | Element observed, behaviour not exercised end to end |
| `PENDING-SPEC` | QA_Enrolamiento, QA_GMOIndustrial | Expected result not defined by any source |
| `DISPUTED-DEFECT` | QA_Nexus, QA_Sispro_Exportadora | Evidence conflicts; business decides |
| `NO-FIXTURE`, `OUT-OF-CI`, `PENDING-TRIAGE`, `BLOCKED-ENV` | QA_Sispro_Exportadora (rule 8b) | See B2 |

**B2. QA_Sispro_Exportadora rule 8b is the mature answer to B1**, and it has no
filing of its own. A closed taxonomy of six `test.skip()` states organised on one
axis: **who unblocks this**.

```
PENDING-CODE    -> Development
DISPUTED-DEFECT -> Business        (requires a file in qa/06-defects/disputed/)
BLOCKED-ENV     -> Infrastructure
NO-FIXTURE      -> QA              (requires a DP-NNN process-debt entry)
OUT-OF-CI       -> nobody; it is a decision, not a blocker
PENDING-TRIAGE  -> QA; EXPIRES at the end of the next sprint
```

It retires seven previous values, including `PENDING-BROWSER`, on the grounds
that "each one was a *reason* used as if it were a *state*". Canonical reason
syntax per skip form, always after the `@Pn` tag. The gate is executable
(`qa/08-azure-integration/scripts/extract-sprint16-testcases.js`), aborting the
ADO sync on an unknown or missing state. The number that motivated it: in Test
Plan 38408, **86 of 198 test cases (43%) reached ADO damaged** - 66 with the
wrong priority (21 P0 published as P2) and 68 with a broken title.

Note the collision: the framework adopted `PENDING-BROWSER` because this same
project filed for it in v1, and the project has since retired it locally. Decide
one vocabulary.

**B3. A fourth defect category.** The framework defines `open/`, `resolved/` and
`disputed/`. Two projects independently added a place for a finding that is not a
defect: `qa/06-defects/recommendations/` (`REC-SIS-NNN`) in QA_Enrolamiento,
`qa/06-defects/improvements/` in QA_GMOIndustrial. QA_Biofruit also documents
`disputed/` as a genuine intermediate state with its own README.

**B4. Rule 11 has two halves and the framework only ships one.** Four projects
rewrote it. The framework prohibits certain characters; the projects add the
mandatory half: Spanish text must be written in correct Spanish, accents
included (Latin Extended U+00C0-U+024F permitted). Plus a **propagation
clause**: when restating the rule in a subagent prompt, skill or rubric, the
"accents are permitted" half must travel with it. Measured incidence of the
defect: **98-99%** of agent-generated artefacts.

**B5. BOM policy is per file type, not global.** The framework says UTF-8
without BOM, everywhere. Four projects corrected it: `.ps1` files must be UTF-8
**with** BOM, because Windows PowerShell 5.1 reads a BOM-less file with the ANSI
codepage and corrupts every accented literal. QA_Biofruit states it plainly:
this is not solved by removing accents, it is solved by adding the BOM.
Companion rule: any script POSTing text to a REST API must pass
`[Text.Encoding]::UTF8.GetBytes($json)`, never a raw `[string]`.

**B6. `AGENTS.md` as a review rulebook.** QA_Biofruit, QA_Enrolamiento,
QA_GMOIndustrial and QA_Sispro_Exportadora all have one, and the first three
converged on the **same ten-section structure with the same rule prefixes**
(`S*` security, `A*`, `T*` traceability, `E*`, `H*` tooling, `L*`, `P*`
automation, `C*` commits). The framework ships no template for it. The most
portable section is section 10, **"what NOT to report as a finding"**: an
anti-noise table of recurring false positives from AI reviewers
(`PENDING-BROWSER` markers, `<PLACEHOLDER>` text, ASCII diagrams that exist
precisely because Unicode arrows are banned).

**B7. Tests for the framework's own infrastructure.** The scaffold ships
`lane-lock.js`, `lane-config.js` and `global-setup-guards.js` with no tests.
QA_Enrolamiento and QA_Nexus both wrote `scripts/lane-lock.test.js` and
`scripts/global-setup-guards.test.js` using `node --test`, adding zero
devDependencies. These should ship in `templates/automation-scaffold/scripts/`.

**B8. `priority-and-feasibility.md`.** Present byte-identical in QA_Enrolamiento
and QA_Nexus at `skills/qa-test-plan/references/`, and in QA_Sispro_Exportadora.
Contains the full test-plan template (10 sections), a **P0-P3 priority decision
tree** and an **automation feasibility table** (fully / partly / not
automatable). It is absent from the framework; v1 of the Exportadora filing
asked for it to be kept and it never landed. Copy it as is.

**B9. ADO work item full-content read protocol.** QA_Biofruit, QA_Enrolamiento
and QA_Sispro_Exportadora each wrote
`qa/00-standards/ado-workitem-full-read-protocol.md`, and QA_Nexus references it
without having the file. Blocking five-point protocol: title + State + **Reason**
(Reason distinguishes "Completed" from "Removed" / "Duplicate" / "Cut"), full
Description, **every embedded image** (`<img src="...attachments/{guid}">`, often
the only place that reveals whether the item is a new screen or a section of an
existing one), comments, and parent/child hierarchy. Includes a working
PowerShell recipe. The Exportadora v4 filing adds: the protocol must also cover
**User Story**, not just Task/Bug/Issue.

**B10. Credential policy in three tiers**, by lifetime and blast radius
(QA_Biofruit and QA_Enrolamiento, identical):

```
identity  ~/.ado/identity.ps1          ADO_ORG + ADO_PAT, global secret, never versioned
context   qa/qa-framework.config.json  versioned: the NAMES of the env vars, never values
secrets   ~/.ado/projects/<profile>.ps1  per-project secrets
                |
                v
          ~/.ado/load.ps1 composes them, resolving the repo with
          `git rev-parse --show-toplevel`, and reports missing vars
          BY NAME, never by value
```

Hard rules: never persist the PAT as a Windows user environment variable
(`HKCU\Environment` is readable by every process of that user), never copy a
credential file into a worktree, ACL `~/.ado` without inheritance. It also
motivates splitting `ADO_PROJECT` into **`ADO_PROJECT_READ` / `ADO_PROJECT_WRITE`**:
a single value cannot express reading from one project and writing to another.

### 6C. High-value mechanics found in a single project

**C1. Defect-suite polarity** (QA_SisproModular_Exportadora
`qa/07-automation/e2e/tests/defects/`, and QA_Enrolamiento `lib/defects.ts`).
Each test asserts what the *spec* requires, never today's behaviour. An open
Issue is marked `openDefect(<adoId>, <reason>)` (a `test.fail`), so:

```
test fails  -> expected failure -> run stays GREEN
test passes -> "unexpected pass" -> run goes RED -> THAT is the signal the Issue was fixed
```

Supporting parts, all of them load-bearing:
- `InfraError` for expired session, app down, non-JSON or non-200 responses,
  timeouts, selector drift. Prescribed order: do every action and observation
  first, raise `InfraError` on anything unknown, and call `openDefect()` **only
  immediately before the pure assertions** - otherwise a broken precondition
  would be swallowed as the expected failure and reported green. QA_Enrolamiento
  reached the same conclusion independently in `lib/defects.ts`.
- `DEFECTS_DIAG=1` disables the marker, to confirm a test fails because of the
  defect and not because of a bug in the test.
- `CleanupRegistry` as a Playwright fixture; `report-cleanup-failures.js` scans
  the JUnit output for `[CLEANUP-FAILED]` and raises an Azure Pipelines warning,
  so a failed cleanup cannot fail the test but also cannot pass unnoticed.
- Health-guard vs regression distinction: a test whose data was patched but whose
  root cause is still live is demoted to a read-only health guard with the note
  that "green does NOT mean the cause is fixed".

**C2. `qa-clock.ps1`** (QA_SisproModular_Exportadora `qa/tools/`, copied from
QA_Enrolamiento, which has the fuller `qa/tools/`). Its header states the
problem: *LLM agents have no perception of elapsed time and will invent it if
asked.* Every timestamp exchanged between orchestrator and workers must come
from the system clock through this helper. API: `Get-QaStamp`, `Get-QaStampUtc`,
`Write-QaLog`, `Start-QaBudget -Hours`, `Get-QaBudget`, `Get-QaElapsed`. The
budget anchor persists in a JSON file **because every Bash call is a new
process**. Wired into the config as `agentSettings.clockHelper`.

**C3. QA_Enrolamiento `qa/tools/` (the richest tooling set found).**
- `qa-encoding-check.ps1` validates **both halves** of rule 11 plus BOM by
  extension. The framework's `check-forbidden-chars.js` only checks the first.
- `qa-spec-verify.ps1` counts real RN/FL/TC identifiers without assuming a
  heading level, because a fixed-level regex silently reports zero on a valid file.
- `qa-content-integrity.ps1` proves a prose rewrite did not move identifiers,
  `file:line` citations or numbers, by diffing against a git ref.
- `harvest-screen.js` visits each screen **once** and dumps everything the six
  spec files need into committed JSON evidence, because model-driven exploration
  costs 56-267 USD per thousand exercises.
- `md-to-latex.py` plus `md-to-latex-layout-check.py`: Markdown to LaTeX to PDF
  with automated layout checks (ghost banding, unbanded row, orphan at the foot).

**C4. QA_Enrolamiento `qa/07-automation/e2e/lib/` (automation safety layer).**
- `sql-guard.ts`: three-layer read-only validator that tokenises just enough
  T-SQL to ignore comments and literals, then applies a first-word rule plus a
  forbidden-keyword scan, against a frozen allowed-procedure list.
- `db.ts`: every statement inside a transaction that is **always** rolled back;
  driver errors re-thrown with the password scrubbed and the original object
  dropped, since it carries the connection config.
- `preconditions.ts`: **three-state semantics**. NOT CONFIGURED -> `test.skip`
  naming the missing variables (never values). BROKEN -> **fail**, never skip,
  because in an unattended pipeline a skip turns the regression green while
  testing nothing. `QA_STRICT_PRECONDITIONS=1` turns every skip into a failure.
- `env.ts`: does **not** call `dotenv.config()`, which would inject the whole
  `.env` into `process.env`; each consumer asks for the exact keys it needs.
  The same conclusion is the highest-reach item of the Exportadora v5 filing.

**C5. Login never happens inside a test** (QA_GMOIndustrial
`lib/core/role-session.ts`). With `trace: 'retain-on-failure'`, the login form
POST - password included - would be stored as a trace resource. Role logins
happen only in `global-setup.ts`; tests consume pre-generated `storageState`.
Session TTL via `QA_SESSION_TTL_MS`. QA_SisproModular_Exportadora's
`lane-session.js` reaches the same place from the other side: it drives the
browser **with tracing off** so typed credentials never reach an artefact, and
is **fail-closed** - it does not save a session if it cannot confirm the expected
company, season and plant.

**C6. Environment-failure classifier** (QA_Nexus
`e2e/scripts/_shared/environment-health-check.js`). Answers "is this an
application defect or a broken environment?" It runs only on the failure path,
after the main assertion already failed, and distinguishes: session invalidated
by another process, unstable network, degraded server, or a real defect. The
caller feeds it `page.on('requestfailed')` and `page.on('response')` data.
Validated live on 2026-07-30 with a deliberate session intrusion. **It is the
documented technical justification for why the lane lock exists.**

**C7. `sync-from-copilot.js`** (QA_Nexus `.claude/scripts/`). Regenerates
`.claude/skills/` and `.claude/qa-framework-instructions.md` from `.github/skills/`
and `.github/instructions/`, rewriting paths and stripping YAML frontmatter.
It never touches `.github/` or `node_modules/`. **The framework publishes for
Copilot only; this is the missing bridge to Claude Code**, and it exists in one
project out of eight.

**C8. Opt-in Playwright projects** (QA_SisproModular_Exportadora). Projects
`defects`, `regression` and `fixtures` register only under `RUN_DEFECTS=1` etc.,
so `npm test` never sees them. Since Playwright allows one global
`globalSetup`/`reporter`, these are chosen from the `--project` selection read
out of `process.argv`. Launch wrappers use `spawnSync` **without a shell**,
because setting an env var inline in an npm script is not portable between
`cmd.exe` and `sh`.

**C9. Fixed-data fixture engine** (QA_SisproModular_Exportadora `lib/fixtures/`).
Fixed records per lane and screen (`QAMOD-FIX-L<n>-<SCREEN>`) created once and
repaired before each run, instead of ~60 records per run. Idempotent
`ensure`/`repair`/`status` with states `EXISTS` / `CREATED` / `REPAIRED` /
`BLOCKED` / `FAILED`. Guardrail: it only ever touches records carrying its own
lane prefix. `global-setup-regression.ts` aborts the run if any fixture ends
`FAILED`.

**C10. Config-driven page object** (QA_SisproModular_Exportadora
`lib/maintainer/MaintainerPage.ts`). One generic page object for every
list-plus-form screen, driven by a typed `ScreenConfig`; `lib/screens/*.ts` is
configuration and nothing else. Replaces the inheritance hierarchy of
`Base*CRUDPage` used in the predecessor project. `save()` returns tripartite
semantics: `{sent:false}` (client blocked it), `{sent:true,status,envelope}`, or
`InfraError`.

**C11. ADO scripts the framework lacks** (QA_SisproModular_Exportadora
`qa/08-azure-integration/scripts/`). `publish-results.ps1` publishes manual
execution results as test runs linked to test points, covering a gap the project
names explicitly: *"qa-framework does not ship a script for manual results
linked to test points"*. `create-issue.ps1` is idempotent via an exact-title WIQL
query before creating. Both carry the convention "must be saved as UTF-8 WITH
BOM". Companion pattern: `qa/08-azure-integration/drafts/` holds a draft plus a
dry-run payload plus a PREVIEW before any ADO write.

**C12. Tracked exception regime** (QA_Sispro_Exportadora `AGENTS.md`). No
exception without an ID: `TIMEOUT-001..004` for the only permitted
`waitForTimeout` calls, `TOAST-001..005` for exempted helpers (all marked
`@deprecated`, no new callers allowed), `CONTRACT-001` for the one endpoint that
does not use the standard envelope. Generalisable governance pattern: an
exception needs an ID, a live-verified justification, and a no-new-callers
clause.

**C13. PR review rubric with escalation levels** (QA_Biofruit
`qa/00-standards/checklist-revision-pr-qa-test.md`, v0.2). Answer to the meeting
note about PR evaluation. The work survived as a rubric plus three application
reports; **no script exists** - `ado-git.ps1` has no pull-request functions at
all, and the queries were made ad hoc in-session with the generic
`Invoke-AdoGet`. Design worth keeping:
- Review unit is the **work item**, not the PR: front/back/db PRs of one work
  item are approved or returned together.
- Three levels: `Bloqueante` -> vote "Waiting for author" (-5); `Advertencia` ->
  approve, but the comment warns it will block in future; `Informativo` ->
  measured only. **A criterion is promoted when the team agrees the practice is
  established**, and a table of suspended criteria records what was retired and why.
- Operational detail that costs a merge if missed: where policy requires
  comments resolved before merge, a warning comment must be published **in
  Closed/Resolved state**, or it blocks the merge even on an approved PR.
- Report template: verdict by criterion with concrete evidence, then
  "Observaciones para QA" (what the merge does to QA's own work) and
  "Limitaciones de este analisis" (what was not verified). Those last two
  sections separate the mechanical verdict from QA judgement and declare the real
  scope of the evidence.

**C14. Reporting standard** (QA_Enrolamiento `FRAMEWORK-FIXES-qa-framework.md`
plus the implementation in `qa/00-standards/norma-de-informes-qa.md` and
`plantilla-informe-qa.md`, in force since 2026-10-30). The most complete filing
of the set. Diagnosis of the current `templates/execution-report.md`: metrics
first, `Recommendations` near the end, `Sign-off` last - so what a Product Owner
acts on is what they are least likely to reach. Proposes:
- Three audiences as **position and depth**, not as recipients; the first part
  alone must be enough to decide, with a three-question sufficiency test.
- Three report **types**, chosen explicitly: risk report, test execution report,
  release approval. A new iteration of the system under test produces a **new
  report**, not a new version of the old one. The real incident behind this:
  version 3 of a risk report was built by extending v2 which extended v1, each
  step correct and traceable, and the document still failed - one document trying
  to answer three different questions.
- Partial report rules, and release-approval rules where QA does **not** have a
  veto: a verdict category, the reviewed fraction stated in the first sentence,
  and every residual risk with a **named** accepter - "accepted by the parties"
  identifies nobody.
- Optional blind review by a separate reviewer; in the incident above it is what
  separated "the author does not understand" from "the document is hard to read".

**C15. The `docs/` layer** (QA_SisproModular_Exportadora). Project context that
outlives sprint rotation, outside `qa/`: `00-antecedentes.md` (dated intake
record with explicit "inferred" markers for anything unverified),
`01-plan.md` (phases plus an explicit model policy: orchestrator interprets and
decides, executors do not), `02-pendientes.md` (`PEND-NN` register for findings
deliberately not yet reported), `03-plan-automatizacion.md`. Related signal: in
that project `qa/README.md` and `qa/memory/` were left untouched at their
placeholders while all real state went to `AGENT-NEXT-STEPS.md` plus `docs/`.

### 6D. Filed, still open in the consumer projects

**D1. Who calls `heartbeat`? Decided, and half shipped.** (Exportadora v5
item 5.) On 2026-08-22 a subagent investigated for over 20 minutes without
calling heartbeat; the sweep released lane 5 while it was still in use.
Generalisable root cause: *a liveness protocol that depends on an uninstructed
party is not a control.* The filing posed it as a fork - executor or dispatcher -
and explicitly called itself "a request for a decision, not a patch".

**That decision was taken in this repository**:
[`docs/decisions/lane-heartbeat-caller.md`](decisions/lane-heartbeat-caller.md),
dated 2026-09-08, status *accepted, not implemented*. The dispatcher calls
`heartbeat` from its own wait loop; the executor is not required to call it and
must not be relied upon to. Scope stated there: the N-lane work still pending
upstream (v3 items 1-4, v5 items 1, 2, 4).

Correction, made the same day: an earlier version of this paragraph said the
framework ships the sweep with none of the decision implemented, and that the
decision never reached the consumer projects. Both claims were already false
when written. The agent-agnostic half shipped on 2026-09-08, the same day as the
decision, and is part of v1.12.0: rule 12 of
`templates/qa-framework.instructions.md` (commit `9930f5a`) states that the
dispatcher keeps the lane alive with `heartbeat` and that the dispatched worker
must not be relied upon, and `lane-lock.js` ships the `heartbeat` verb and the
composite staleness predicate. Five of the consumer projects declare 1.12.0.

What is missing is the Claude Code half. `templates/qa-framework.rules.md`, the
file `scripts/init.js` installs as `.claude/rules/qa-framework.md`, does not
mention lanes at all, and Claude Code does not read `.github/instructions/`. So a
project working with Claude Code receives the sweep and no lane rule - not even
the agent-agnostic one. That is the risk the decision's Consequences section
warns about, narrowed to one agent. Whether each consumer's copy of
`.github/instructions/` actually carries rule 12 was not checked in this survey;
several show stale version headers (see A2).

**D2. Lane capabilities are per-lane state.** There was a period where lanes 4-6
had no MCP server, so handing lane 5 to a subagent handed it tools that did not
exist. The framework models lanes but not their capabilities.

**D3. MCP session contamination** (v3 item 2, 2026-07-24). A single shared
`playwright` MCP server let one tab capture a request carrying another account's
token. Fix in use: one `--isolated --storage-state=<path>` server per lane, in
`.mcp.json`. The framework defines `parallelLanes` but does not generate it.

### 6E. Two rival implementations of the same thing

| Problem | Implementation A | Implementation B |
|---|---|---|
| Execution report | `sispro-modular`: project skill `qa-informe-ejecucion`, ADO to Word via `docx` | `QA_SisproModular_Exportadora`: user skill `latex-pdf`, LaTeX source in `qa/05-test-execution/informe/`, plus QA_Enrolamiento's `md-to-latex.py` toolchain |
| Skip-state vocabulary | Framework 1.13.2: `PENDING-BROWSER` (adopted from Exportadora v1) | QA_Sispro_Exportadora rule 8b: `PENDING-BROWSER` **retired** as a reason masquerading as a state |

Both need a decision before anything is ported. Everything else found across the
projects is complementary, not duplicated: Marcela built API and load testing,
the Proyectos side built E2E regression, defect suites and ADO publication.

### 6F. Companion projects (not framework candidates)

**`ado-workitem-quality`** - LLM reviewer of ADO work item families (one User
Story plus its Tasks). Reads the family, evaluates against a rubric plus
deterministic checks D1-D8, proposes rewrites, and has an independent judge
agent validate them. Never writes to ADO. Born as a copy of
`QA_Sispro_Exportadora\tools\ado-monitor\`, deliberately placed in `tools/` so as
*not to depend on how `@keber/qa-framework` is installed or upgraded*. Keep it as
a companion, but upstream three assets:
1. **The severity model**: severity = inferibility x cost of a wrong inference,
   as an I1-I3 by C1-C3 matrix with real calibration anchors. Severity is
   explicitly *not* "how much text is missing". This is reusable QA methodology.
2. **The context-manifest contract** (`docs/context-manifest.md` plus
   `.ado-quality/context.json`): a declarative, code-free way for a project repo
   to expose its knowledge base to an external tool, with `describes` layers
   (`business-rules` / `glossary` / `conventions` / `current-behavior`), relative
   paths only, no `..`, no symlinks. The framework needs a sanctioned way to do
   this.
3. **`src/review/check-xrefs.ps1`**: deterministic, zero-LLM cross-reference
   validator. Exactly the kind of checker the framework already ships.

Also: `src/lib/ado-powershell/` is a **third** copy of the same ADO library
(framework `integrations/ado-powershell/`, the `tools/` original, and this). The
version here is the best - Git Credential Manager first with PAT fallback, and
it surfaces the real `X-TFS-ServiceError` on 401/403, which would have prevented
a multi-day misdiagnosis in October. Consolidate on one copy.

**Risk**: this repository has **no git remote**. 19 commits of real methodology
exist on one machine only.

**`qa-monitor`** - Python plus Streamlit local dashboard for the QA tester,
read-only against ADO, no LLM anywhere. Own GitHub remote, PRs, CI on two
operating systems, ~2,600 lines of code against ~2,850 lines of tests including a
fake ADO server. Do not integrate: different language, runtime, audience and
lifecycle. Worth doing instead: name the relationship in the framework docs, so
the three ADO-touching efforts stop reimplementing WIQL and auth separately.

### 6G. Hygiene and risks noted in passing

| Risk | Where |
|---|---|
| `ado-workitem-quality` has no git remote | `Proyectos\ado-workitem-quality` |
| A live `storageState` plus two `.env` files on disk, with a 206-byte `.gitignore` against 1,720 bytes in a sibling project | `QA_Nexus\qa\07-automation\e2e\` |
| `qa-playwright-radzen-blazor` skill was copied between projects and **all its cited paths point at the other project** | `QA_SisproModular_Exportadora\.github\skills\` |
| `create-issue-h01.ps1` has a corrupted line from a bad text replacement; it does not run | `QA_SisproModular_Exportadora\qa\08-azure-integration\scripts\` |
| The project's `lane-lock.js` (434 lines) is now **older** than the framework's (589) - the contributor fell behind their own contribution | `QA_Sispro_Exportadora` |
| `AGENTS.md` still requires skip states that its own rule 8b retired | `QA_Sispro_Exportadora` |
| `.claude/mcp/` defines 3 lanes while `.mcp.json` defines 6; rule 13 still says 3 | `QA_Sispro_Exportadora` |
| `.mcp.json` storage-state paths are absolute and hardcoded to one machine | `QA_SisproModular_Exportadora` |

### 6H. Already absorbed upstream (do not redo)

Verified by grep against 1.13.2, from the five Exportadora filings: the broken
`spec-file-formats.md` reference, the duplicated blocks in `qa-test-plan` and
`qa-test-cases` SKILL.md, `PENDING-BROWSER`, the `tsc --noEmit` gate, the
"official suite is source of truth" rule, the known-issues check,
`templates/automation-scaffold/scripts/lane-lock.js` (with `QA_LANE_LOCKS_DIR`,
heartbeat and `dotenv.parse`), `lane-config.js`, `global-setup-guards.js`,
`parallelLanes`, lane rule 12 in the instructions, `check-spanish-accents.js`,
`pom-template.md` and `output-verification.md`.

Still missing from that set: `priority-and-feasibility.md` (B8), which v1 asked
to keep and which disappeared upstream.

---

## Recommended sequencing

0. **Section 6A first, before any new content.** A1 (upgrade destroys `lib/`)
   is the one that is actively dangerous: three projects hold their entire
   automation library in a folder the upgrade relocates. It needs a regression
   test, not just a patch. A2 to A6 are cheap once A1 is open.
1. **Section 6B, the convergent extensions.** These are the cheapest wins in the
   document: the design work is done, it was done several times, and the
   agreement between projects is the evidence. Resolve the `PENDING-BROWSER`
   collision (B1/B2) as part of it.
2. Candidates 1 and 2 together. They are one body of work: the write rules have
   nowhere to live without the integration scaffold, and the scaffold is the
   biggest hole in the framework today.
3. Candidate 3 (k6) as optional stage 7. Share one write-safety policy with
   candidate 1 instead of writing it twice. Azure Load Testing emission is a
   separate follow-up spec.
4. Section 6C, picked individually. C1 (defect-suite polarity), C2 (clock), B7
   plus C3 (tooling with its own tests) and C7 (the Copilot-to-Claude bridge)
   are the ones with the broadest reach.
5. Candidate 4 / section 6E last. It needs the A-versus-B decision resolved
   first, plus the packaging question about skills with npm dependencies.
6. Candidate 5 and section 6F reviewed opportunistically.

## Cross-cutting decisions to make before any port

- One written write-safety policy, referenced by both the API tests and the
  performance tests, instead of two independent rule sets.
- Where project-editable policy ends and non-editable guard code begins.
- Whether skills may carry their own npm dependencies and binary assets.
- One skip-state vocabulary (6E), one execution-report implementation (6E).
- D1 needs no decision - `docs/decisions/lane-heartbeat-caller.md` took it on
  2026-09-08, and its agent-agnostic half shipped in v1.12.0. What is open is
  the Claude Code half: `templates/qa-framework.rules.md` carries no lane rule
  at all.
- Whether the framework publishes for Claude Code as well as Copilot, or keeps
  leaving each project to write its own bridge (C7).
- Re-verify every candidate against 1.13.2 before porting. No consumer project
  is on 1.13.2, and three disagree with themselves about which version they run.

## Immediate action, independent of all of the above

Give `ado-workitem-quality` a git remote. Nineteen commits of methodology -
the severity model, the context-manifest contract, the cross-reference
validator - exist on one machine with no backup.
