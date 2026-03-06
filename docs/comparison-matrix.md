# docs/comparison-matrix.md

**Phase 1 Artifact** — Source: analysis of two embedded QA implementations.

> **Note**: This document covers the comparative inventory of Repo A (`redacted-repo-web`) and Repo B (`redacted-repo`). It was the primary input for Phase 2 (classification) and Phase 3 (framework design).

---

## Repository Profiles

| Attribute | Repo A (`redacted-repo-web`) | Repo B (`redacted-repo`) |
|---|---|---|
| **Application stack** | ASP.NET MVC 5 + Web API 2 + SQL Server | Blazor WebAssembly + .NET + Radzen |
| **UI component library** | jQuery, Select2, toastr, SweetAlert2, Metronic | Radzen Blazor components |
| **Authentication** | Form login: RUT + password, `/Seguridad/Login` | Form login: email + password, Blazor identity |
| **QA environment URL** | `https://redactedURL.com` | `https://redactedURL.com` |
| **Modules documented** | 1 module (RCL Colación Fría), 7 submodules | 4 modules (Personas, Operación, Sistema, Reportes), 17+ submodules |
| **Test cases documented** | ~160 TCs across 7 submodules | ~894 TCs across 17+ submodules |
| **ADO integration level** | Partial (Wiki tools, Plan IDs referenced) | Full (pipeline, reporter, inject-ado-ids.ps1, module-registry.json) |
| **Playwright suite** | Yes (Sprint 40: 26 P0 tests, 24 pass/2 skip) | Yes (67 automated, 53 pass/2 fail/12 skip) |
| **Standards folder** | No (`00-standards/` not present) | Yes (naming-conventions, bug-template, TC-template, test-data-guidelines) |
| **Session retrospectives** | Yes (06-defects used, 2 defects filed) | Extensive (SESSION-SUMMARY-* files at qa root) |
| **08-azure-integration** | Not present | Fully implemented |

---

## Item-by-Item Comparison Matrix

| Item | Repo A | Repo B | Common? | Different? | Generalizable? | Needs Param? | Out of Framework? |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **8-folder qa/ structure (00–08)** | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| **6-file submodule template** | ✅ | ✅ | ✅ | Minor | ✅ | ❌ | ❌ |
| `00-inventory.md` | ✅ | ✅ | ✅ | ❌ | ✅ | Module code | ❌ |
| `01-business-rules.md` | ✅ (RN-* IDs) | ✅ (RN-* IDs) | ✅ | ❌ | ✅ | Module code | ❌ |
| `02-workflows.md` (FL-* IDs) | ✅ | ✅ | ✅ | ❌ | ✅ | Module code | ❌ |
| `03-roles-permissions.md` | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| `04-test-data.md` | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| `05-test-scenarios.md` (TC-* IDs) | ✅ | ✅ | ✅ | ❌ | ✅ | Module code | ❌ |
| **Agent instructions: module analysis** | ✅ (766 lines) | ✅ (834 lines) | ✅ | Minor | ✅ | Project URL | ❌ |
| **Agent instructions: E2E generation** | ✅ (Sprint-specific) | ❌ | ❌ | Major | ✅ (extract pattern) | Module scope | ❌ |
| **ADO integration instructions** | ❌ | ✅ (AGENT-ADO-INTEGRATION.md) | ❌ | — | ✅ | Org/Project/IDs | ❌ |
| **QA Structure Guide** | ✅ (994 lines) | ✅ (1018 lines) | ✅ | Minor wording | ✅ | ❌ | ❌ |
| **00-standards/ folder** | ❌ | ✅ | ❌ | — | ✅ (adopt from B) | ❌ | ❌ |
| **Naming conventions doc** | Embedded in structure guide | Standalone doc | Partial | Yes | ✅ | Module codes | ❌ |
| **Bug report template** | ❌ | ✅ | ❌ | — | ✅ | ❌ | ❌ |
| **Test case template** | ❌ | ✅ | ❌ | — | ✅ | ❌ | ❌ |
| **Test data guidelines** | ❌ | ✅ | ❌ | — | ✅ | Env var names | ❌ |
| **session-summary.md pattern** | ❌ | ✅ (2 examples) | ❌ | — | ✅ | ❌ | ❌ |
| **Multi-role globalSetup (Playwright)** | ✅ (3 roles, sequential) | ✅ (1 role, single) | ✅ (pattern) | Parameters | ✅ | Role count, selectors | ❌ |
| **storageState auth reuse** | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| **EXEC_IDX / RUN_SLOT date pattern** | ✅ | ❌ (uses Date.now() only) | ❌ | Major | ✅ (adopt from A) | ❌ | ❌ |
| **3-layer email validation strategy** | ✅ | ❌ | ❌ | — | ✅ (domain-agnostic) | ❌ | Optional |
| **playwright-azure-reporter** | ❌ | ✅ | ❌ | — | ✅ | planId, suiteId | Optional |
| **inject-ado-ids.ps1** | ❌ | ✅ | ❌ | — | ✅ | ❌ | Optional |
| **ADO pipeline (azure-pipeline-qa.yml)** | ❌ | ✅ (367 lines) | ❌ | — | ✅ | Org, project, branch | Optional |
| **module-registry.json** | ❌ | ✅ | ❌ | — | ✅ | Module paths/IDs | Optional |
| **ado-ids-mapping.json** | ❌ | ✅ | ❌ | — | ✅ | All IDs | Optional |
| **Debug artifact policy** | ❌ | ✅ (DEBUG-ARTIFACTS-POLICY.md) | ❌ | — | ✅ | ❌ | ❌ |
| **UI as source of truth principle** | Implied | ✅ (UI_COMO_FUENTE_DE_VERDAD.md) | ✅ (implicit) | Documentation | ✅ | ❌ | ❌ |
| **TC origin classification** | ❌ | ✅ (UI-OBSERVADO/PENDIENTE-CODE/BLOQUEADO-PERMISOS) | ❌ | — | ✅ | ❌ | ❌ |
| **BLAZOR_WASM_AUTOMATION.md** | ❌ | ✅ | ❌ | — | Partial | UI library | Optional |
| **RADZEN_COMPONENTS_PLAYWRIGHT.md** | ❌ | ✅ | ❌ | — | Partial | UI library | Optional (Blazor adapter) |
| **DB schema documentation pattern** | ✅ (Mermaid ER) | ❌ | ❌ | — | ✅ (pattern only) | DB naming | Optional |
| **Correctness criteria** | ✅ (≥2 passes with different EXEC_IDX) | ❌ | ❌ | — | ✅ | ❌ | ❌ |
| **5-layer debugging methodology** | ✅ | ❌ | ❌ | — | ✅ | ❌ | ❌ |
| **Page Object Model (POM) pattern** | ✅ (4 POMs) | Inline (no POMs) | Partial | Approach | ✅ (recommend POMs) | ❌ | ❌ |
| **06-defects/ directory** | ✅ (2 active DEFs used) | ✅ (folder only, no active DEFs) | ✅ | Usage | Conditional | ❌ | Optional |
| **Seed specs pattern** | ❌ | ✅ (seeds/*.spec.ts excluded from runs) | ❌ | — | ✅ | ❌ | Optional |
| **automation-feasibility-analysis.md** | ❌ | ✅ | ❌ | — | ✅ | ❌ | ❌ |
| **Coverage mapping (COVERAGE-MAPPING.md)** | ❌ | ✅ | ❌ | — | ✅ | ADO IDs | Optional |
| **Project-specific URLs** | ✅ (redacted) | ✅ (redacted) | Both | Different | ❌ (parameterize) | QA_BASE_URL | ❌ |
| **ADO org / project names** | redacted-organization / redacted-project | redacted-organization / redacted-project | Org same | Project different | ❌ (parameterize) | ADO_ORG, ADO_PROJECT | ❌ |
| **Login selectors** | `#m_login_signin_submit` (Metronic) | `#email-input`, `#password-input` (Blazor) | Different | Major | ❌ (parameterize) | LOGIN_EMAIL_SELECTOR, etc. | ❌ |
| **Application-specific form selectors** | `#tbl_redacted`, `#redacted` | `.rz-data-row`, `input.rz-textbox` | None | Major | ❌ | ❌ | Yes (project adapters) |
| **Test user DNIs / real personal data** | DNIs in test-data.ts, personas.md | None (uses env vars) | None | Major | ❌ | ❌ | Yes (project data) |
| **Module-specific business data** | redacted | redacted | None | Major | ❌ | ❌ | Yes (project data) |
| **Sprint references** | redacted sprint | No sprints (session-based) | None | Different | ❌ | ❌ | Yes (project context) |
| **Developer names** | redacted names | None | None | — | ❌ | ❌ | Yes (project context) |
| **Internal SOAP email service** | EnvioMailSoapClient | None | None | — | ❌ | ❌ | Yes |

---

## Summary Counts

| Category | Count |
|---|---|
| Items common to both repos | 14 |
| Items only in Repo A, generalizable | 8 |
| Items only in Repo B, generalizable | 16 |
| Items that need parameterization | 12 |
| Items that are purely project-specific (out of framework) | 10+ |
| Optional/plugin items | 9 |

---

## Key Differences That Create Design Tensions

### 1. Login credential type: RUT vs email

- Repo A uses RUT (Chilean national ID) as username
- Repo B uses email as username
- **Resolution**: Parameterize via `QA_USER_EMAIL` and `QA_USER_PASSWORD` env vars; the login selector set is a project config parameter in `qa-framework.config.json`

### 2. Single-role vs multi-role globalSetup

- Repo A: 3 roles (solicitante, encargado, admin) saved sequentially to `.auth/{role}.json`
- Repo B: 1 role saved to `.auth/session.json`
- **Resolution**: Scaffold supports both. Config parameter `testUsers[]` drives how many roles are set up. Template defaults to single-role; multi-role is documented as an extension.

### 3. ADO integration depth

- Repo A: ADO IDs referenced in comments; no pipeline or reporter
- Repo B: Full pipeline, playwright-azure-reporter, inject-ado-ids.ps1, module-registry.json
- **Resolution**: ADO integration is a fully optional plugin (`integrations/ado-powershell/`). The framework core does not require it.

### 4. Standards folder

- Repo B has a mature `00-standards/` folder absent from Repo A
- **Resolution**: Adopt the standards from Repo B as the framework baseline, since they are the more complete and generalized set.

### 5. `06-defects/` directory

- Repo A: Used actively (2 bugs filed, test skips reference DEF-IDs)
- Repo B: Folder exists but no active defect files
- **Resolution**: See `docs/generalization-decisions.md` §7 for the full evaluation. Decision: **keep as optional, not required by framework core**.

### 6. Test naming convention

- Repo A: `[Nx] Title @Pp` (sprint-relative sequential numbering)
- Repo B: `[ADO_ID] Title` (ADO Work Item ID prefix)
- **Resolution**: Framework uses `[{ID}] {title} @{priority}` where `{ID}` defaults to a local TC-ID (e.g., TC-MOD-SUB-001) and is replaced with ADO WI ID when ADO integration is enabled.
