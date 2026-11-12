<!--
  AGENTS.md template - review rulebook for a QA repository (@keber/qa-framework).

  How to adopt it:
    1. Copy this file to AGENTS.md at the root of your repository.
    2. Replace every {{PLACEHOLDER}} and delete the rows that do not apply.
    3. Delete this comment block.

  This file is project-owned. The framework installs it once as
  qa/00-standards/agents-md-template.md and never updates it; `upgrade` never creates,
  overwrites or edits your AGENTS.md. Write it in the language your QA documentation
  uses; rule IDs (S1, A1, T1, ...) stay the same in every language so reviews can cite them.
-->

# AGENTS.md - Review rules for the QA repository

> QA repository for **{{SYSTEM_UNDER_TEST}}**.
> It holds specifications, test cases, verification tools and automation.
> **It does not hold product code**: that lives in {{PRODUCT_REPOSITORY}}, which is read-only for QA.
>
> Product branch under test: `{{BRANCH_UNDER_TEST}}`.
> Framework: `@keber/qa-framework` v{{FRAMEWORK_VERSION}}.

Every rule has an ID. A review finding cites the rule it violates (for example "violates S1");
a finding that cannot cite a rule is an opinion, not a finding.

---

## 1. Security - blocking

These rules take priority over any other consideration.

| # | Rule | Why |
|---|---|---|
| S1 | **Zero credentials in versioned files.** No tokens, API keys, passwords or connection strings | A versioned secret stays in the history even after it is removed from the file |
| S2 | Every credential is referenced by **environment variable name**. In documentation, `<PLACEHOLDER>` | `credentialPolicy: env-vars-only` in `qa-framework.config.json` |
| S3 | `.env` files, `.auth/` folders and `{{LOCAL_CONFIG_FILES}}` stay in `.gitignore` | They hold tokens and QA credentials |
| S4 | No real personal data in versioned files: names, national IDs, emails, phone numbers, images of documents or faces | {{APPLICABLE_DATA_PROTECTION_LAW}} |
| S5 | Test identifiers are synthetic and obviously fictitious | A real identifier in a test case is versioned personal data |
| S6 | **No offensive payloads, exploits or active attack steps** in test cases | A security test case describes **what** to verify and **why**, not how to exploit it |
| S7 | Test cases that exercise a security control carry an explicit authorization precondition | Who approves: {{SECURITY_APPROVER_ROLE}} |

---

## 2. Character encoding - blocking

Framework rule 11. **It has two halves, and checking only the first one is a defect.**

### 2.1 Forbidden: exactly these symbol classes

| Forbidden | Code point | Replacement |
|---|---|---|
| Em dash | U+2014 | ` - ` |
| En dash | U+2013 | ` - ` |
| Horizontal ellipsis | U+2026 | `...` |
| Curly quotes | U+201C U+201D U+2018 U+2019 | `"` and `'` |
| Arrows | U+2190 to U+21FF | `->` and `<-` |

### 2.2 Required: accented text is written correctly

Accented vowels, n with tilde and u with diaeresis (any Latin Extended character, U+00C0 to
U+024F) are **always allowed and must be used normally**, in every kind of artifact.

> **This rule is NOT an instruction to produce ASCII-only output.** Stripping accents to make
> content "ASCII-safe" **is the violation**, not the fix.

**When restating this rule** in a subagent prompt, a skill, an agent definition or a review
rubric, **carry the accent clause with it**. Copying only the prohibition is what produces the defect.

### 2.3 Byte order mark: policy per file type

The two cases are **not interchangeable**.

| Type | Policy | Why |
|---|---|---|
| `.ps1` | **UTF-8 WITH BOM** | Windows PowerShell 5.1 reads a BOM-less `.ps1` with the system ANSI codepage and corrupts every accented literal. **Not fixed by removing accents: fixed by adding the BOM** |
| Every other file (`.md`, `.json`, `.ts`, `.yml`) | **UTF-8 WITHOUT BOM** | No `EF BB BF` bytes at the start |

PowerShell scripts that send text to a REST API pass `[Text.Encoding]::UTF8.GetBytes($json)` as
the body, never a raw `[string]`.

---

## 3. Assertion integrity - blocking

Framework rule 10. It is the rule that gives value to all the others.

| # | Rule |
|---|---|
| A1 | **A test case asserts what the specification requires, not what the application does** |
| A2 | If the application does not meet the specification, the defect is documented. An assertion is **never** inverted or weakened to make a test pass |
| A3 | A failing test that exposes a real defect is worth more than a passing one that hides it |
| A4 | The expected result is **observable and measurable**. "Verify that the system works correctly" is not an expected result |

### Valid states of a test case

An in-scope test case has one of these three states, and no other:

| State | Condition |
|---|---|
| Conforming | The system meets the specified rule |
| Defect | The system violates it **and** a file in `qa/06-defects/open/` documents which rule is violated and what the application actually does |
| Not executable | Marked `PENDING-CODE` (not implemented), `PENDING-BROWSER` (not observed in the UI) or `PENDING-SPEC` (no acceptance criterion), with the question recorded in `{{OPEN_QUESTIONS_FILE}}` |

A finding that violates no specified rule is not a test case state: it is a recommendation,
filed in `qa/06-defects/recommendations/`, and it never makes a test case fail.

---

## 4. Specification traceability

| # | Rule |
|---|---|
| T1 | **Every business rule cites its evidence**: `file:line` in the product repository, or the ID of the work item it comes from |
| T2 | Without evidence it is not a rule, it is a guess. Leave it out, or declare it explicitly as unsupported |
| T3 | Every rule carries its **oracle level** and **confidence** from {{SOURCE_HIERARCHY_FILE}}, the single source of truth for that numbering |
| T4 | A rule with LOW or CONFLICTING confidence **does not produce a defect** until it is resolved against a higher source |
| T5 | A test case's origin is `UI-OBSERVED` **only if the behavior was actually observed** in the environment. Derived from code is `PENDING-BROWSER` |
| T6 | {{WORK_ITEM_RANGE_RULE}} |

---

## 5. Framework structure

| # | Rule |
|---|---|
| E1 | The six files per submodule use the framework's exact names: `00-inventory.md`, `01-business-rules.md`, `02-workflows.md`, `03-roles-permissions.md`, `04-test-data.md`, `05-test-scenarios.md` |
| E2 | They live in `qa/01-specifications/module-{name}/submodule-{name}/`, in kebab-case |
| E3 | Global documents carry a `_` prefix so they do not collide with the reserved names |
| E4 | Identifiers: `RN-{MODULE}-{NNN}`, `FL-{MODULE}-{NNN}`, `TC-{MODULE}-{SUBMODULE}-{NNN}`, `DEF-{NNN}`{{EXTRA_ID_PATTERNS}} |
| E5 | **Rule identifiers are unique per module.** A cross-cutting rule is defined once in {{SHARED_RULES_REGISTRY}}; occurrences in submodules are context, not the source of truth |
| E6 | Identifier headings use three hashes (`### RN-...`) so automated counts work |

### Framework-governed files

| File | Nature | Care when editing |
|---|---|---|
| `qa/AGENT-NEXT-STEPS.md` | **Ephemeral.** Read at the start of every conversation and emptied when the sprint closes | Do not put content there that must persist |
| `qa/README.md` | Living index: module status, blockers, risks, sprint history | - |
| `qa/memory/INDEX.md` | Updated whenever a memory file is added or changed | - |
| `.github/skills/`, `.github/instructions/`, `.claude/rules/`, `.claude/commands/` | Owned by the framework; `npx qa-framework upgrade` refreshes them | Local edits are lost on upgrade: propose them upstream instead |

---

## 6. Verification tools

They are run and **their output is reported**, never a claim of compliance.

```bash
# Framework structure and spec completeness
npx qa-framework validate --strict

# {{PROJECT_VERIFICATION_TOOL_DESCRIPTION}}
{{PROJECT_VERIFICATION_TOOL_COMMAND}}
```

| # | Rule |
|---|---|
| H1 | **Never invent or estimate a timestamp.** Take it from the system clock: `npx qa-framework clock --tz <IANA zone>` |
| H2 | Session state files ({{SESSION_STATE_FILES}}) stay in `.gitignore` |
| H3 | Reported counts come from a tool's output, not from an estimate |
| H4 | **A green tool is not proof of compliance with everything.** It detects what it checks; wording quality and citation correctness need human reading |

---

## 7. Scope - current restrictions

| # | Restriction |
|---|---|
| L1 | {{FORBIDDEN_PATH_OR_PROCEDURE}} is **forbidden**: it is not read, used or invoked |
| L2 | {{PRODUCT_WORK_TRACKING_PROJECT}} is **read-only**. Every QA write goes to {{QA_WORK_TRACKING_PROJECT}} |
| L3 | {{OUT_OF_SCOPE_COMPONENT}} is **out of scope**: {{REASON}} |
| L4 | Areas out of scope stay at **unknown risk**, not absent risk. No reported defects is not evidence of correct behavior |

Each restriction that comes from a decision records who decided it and when, so a later reader
can tell a standing rule from a stale one.

---

## 8. Automation

Applies to `qa/07-automation/`. Run guide and variables in `{{AUTOMATION_README}}`.

| # | Rule |
|---|---|
| P1 | No credentials in code. Everything through environment variables, and `.env` files in `.gitignore` |
| P2 | No fixed waits. Wait for a condition, not for elapsed time. The only exceptions are listed in 8.1 |
| P3 | Every test works on **its own data**. No mutable state shared between tests |
| P4 | Unique dynamic values follow the `EXEC_IDX` pattern |
| P5 | The test title carries the test case ID: `[TC-MODULE-SUB-NNN] title @priority` |
| P6 | **Arrange-Act-Assert.** Each test marks its three phases with `// Arrange`, `// Act` and `// Assert` comments, in that order |
| P7 | Missing precondition (an environment variable is not set) -> skip with a reason that names the variables, never their values. Precondition **set but broken** (connection refused, login rejected) -> **fail**, never skip: in an unattended pipeline a skip there silently turns regression coverage off |
| P8 | **Open defect -> expected failure** with the assertion the specification requires (rule A2); **resolved defect -> plain test**. When an expected failure starts passing, the defect is re-verified; the assertion is never inverted |
| P9 | Writes to a system under test follow `qa/00-standards/write-safety-policy.md`. Database access from automation is read-only unless that policy says otherwise |

### 8.1 Tracked exceptions

**No exception without an ID.** A rule above may be broken only where this register lists the
exact place. Each entry needs three things:

- an **ID** with a prefix per rule it relaxes (for example `TIMEOUT-` for P2, `CONTRACT-` for a
  response contract that differs from the standard one);
- a **live-verified justification**: why no durable alternative exists, and when it was checked
  against the real environment;
- a **new callers** clause: whether new code may reuse the exception. The default is no; a new
  caller first proves that no durable alternative exists for its own case and gets its own ID.

The code carries the ID in a comment at the exception site (for example
`// tracking: TIMEOUT-001`), so reviewers can match code to register. Deprecated helpers kept
for an exception are marked `@deprecated`.

| ID | Rule relaxed | Location | Justification (live-verified, date) | New callers | Exit condition |
|---|---|---|---|---|---|
| {{PREFIX}}-001 | {{RULE_ID}} | `{{FILE_AND_SYMBOL}}` | {{WHY_NO_DURABLE_ALTERNATIVE}}, verified {{YYYY-MM-DD}} | Not allowed | {{WHEN_IT_IS_REMOVED}} |

---

## 9. Commit messages

| # | Rule |
|---|---|
| C1 | Conventional commits: `type(scope): description` |
| C2 | **No attribution to AI agents.** No `Co-Authored-By`, no tool references, no signature footers |
| C3 | The body explains **why**, not what. The diff already says what changed; the reasoning is what cannot be recovered later |
| C4 | Atomic commits: one purpose per commit. Own work is kept apart from dependency updates |
| C5 | Commit messages are written in {{COMMIT_LANGUAGE}} |

---

## 10. What NOT to report as a finding

So that reviews do not generate noise:

| Situation | Why it is not a finding |
|---|---|
| A test case with origin `PENDING-BROWSER`, `PENDING-CODE` or `PENDING-SPEC` | Correct by design: it marks honestly what has not been observed or specified (rules T5 and A2) |
| A message such as "pending observation in QA" where the real UI text is unknown | It is the honest mark of unverified text. Inventing it would be worse |
| `<PLACEHOLDER>` or `{{PLACEHOLDER}}` text in documentation, `.env.example` or templates | Required by rule S2: it is where a secret or project value would otherwise go |
| A rule identifier repeated across submodules of the same module | Cross-cutting rule governed by the shared rules registry (rule E5) |
| A business rule without `file:line` **that is explicitly declared as unsupported** | The declaration is the correct behavior (rule T2) |
| A fixed wait, a non-standard contract or another rule break **listed in the tracked exceptions register** (8.1) with its ID at the site | Already known, justified and tracked. Report it only if the code no longer matches the register entry or a new caller appears |
| An expected failure (rule P8) on a test whose defect is still open | It is how an open defect is kept in the regression suite without bending the assertion |
| Flow diagrams in plain ASCII (`|`, `v`, `+`, `-`, `>`) | Consequence of the Unicode arrow ban (section 2.1). The accents of the surrounding text must still be there |
| {{PROJECT_SPECIFIC_FALSE_POSITIVE}} | {{WHY}} |
