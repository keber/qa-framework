# Skills Architecture

> How QA agent skills are organized in `@keber/qa-framework`.

---

## Why Skills, Not Monolithic Instructions

The previous `agent-instructions/` model loaded one large file (~2,500 tokens each) per task. For an automation session covering 3 submodules, the agent would load the full automation file whether it needed the ADO config or not. With 8 instruction files, that was 20,000+ tokens of constant context pressure.

The 3-layer skill architecture reduces this to ~500 tokens for a typical task, loading detail only when needed.

---

## 3-Layer Model

| Layer | Location | Size | Purpose |
|---|---|---|---|
| 1 — Descriptor | YAML frontmatter in `SKILL.md` | ~50 tokens | Name + description; used for relevance detection |
| 2 — Process outline | `SKILL.md` body | ~400–600 tokens | Step-by-step process without code; always loaded when skill applies |
| 3 — Reference material | `references/*.md` | ~500–1500 tokens each | Detailed templates, code patterns, decision trees; loaded on demand |

The agent reads Layer 2 to understand what to do, then loads only the specific `references/` files it needs for the current step.

---

## Pipeline Sequence

Skills map to the QA pipeline stages defined in `copilot-instructions.md`. The file acts as a **pipeline sequencer** — it defines which stage comes before which, and what the prerequisite is. Skills are the implementation of each stage.

```
Stage 1: qa-module-analysis      (no prerequisite)
   │
   ▼
Stage 2: qa-spec-generation      (requires 00-inventory.md)
   │
   ▼
Stage 3: qa-test-plan            (requires 05-test-scenarios.md)
   │
   ▼
Stage 4: qa-test-cases           (requires test plan)
   │
   ▼
Stage 5: qa-automation           (requires approved specs, no PENDING-CODE)
   │
   ├─ Stage 5b: qa-test-stabilization  (if tests fail)
   │
   ▼
Stage 6: qa-maintenance          (after each application change)


Optional (any time after Stage 4):
   qa-ado-integration            (requires ADO enabled in config)
```

---

## Skill Inventory

| Skill | SKILL.md | References |
|---|---|---|
| `qa-module-analysis` | Stage 1 process (4 phases) | `exploration-checklist.md`, `spec-file-formats.md` |
| `qa-spec-generation` | Stage 2 rules + anti-patterns | `spec-file-formats.md` (shared with qa-module-analysis) |
| `qa-test-plan` | Stage 3 — priority + feasibility rules | `priority-and-feasibility.md` (includes full template) |
| `qa-test-cases` | Stage 4 — TC document rules | `test-case-template.md` |
| `qa-automation` | Stage 5 — patterns + completion checklist | `patterns.md`, `config-checklist.md` |
| `qa-test-stabilization` | Stage 5b — 8 steps + confidence scoring | `classification-protocol.md` (includes report template) |
| `qa-ado-integration` | Optional ADO sync — 6 steps | `scripts-and-config.md` |
| `qa-maintenance` | Stage 6 — update rules | `update-rules.md` |

---

## How Skills Are Installed

When a consumer project runs `npm install @keber/qa-framework`, the `postinstall` script (`scripts/init.js`) copies the entire `skills/` directory from the package to `.github/skills/` in the consumer project:

```
@keber/qa-framework/skills/
  qa-module-analysis/
    SKILL.md
    references/
      exploration-checklist.md
      spec-file-formats.md
  qa-spec-generation/
    SKILL.md
  ...

→ copies to →

{consumer-project}/.github/skills/
  qa-module-analysis/
    SKILL.md
    references/
      exploration-checklist.md
      spec-file-formats.md
  ...
```

The copy uses `writeIfMissing` — it will not overwrite files that already exist in the consumer project. This allows consumer projects to customize their `.github/skills/` without losing changes on re-install.

---

## How to Add a Project-Specific Skill

Consumer projects can extend the skills by adding skill folders directly to `.github/skills/`:

1. Create `.github/skills/{skill-name}/SKILL.md` with YAML frontmatter:
   ```yaml
   ---
   name: my-custom-skill
   description: >
     Describe when this skill should be triggered.
   ---
   ```
2. Add the skill body following the same 4-section structure: prerequisite → steps → rules → outputs
3. Optionally add `references/*.md` for detailed templates
4. Reference the skill from `copilot-instructions.md` if it's part of your pipeline

Project-specific skills are not overwritten by `npm install` updates.

---

## Mapping: Old vs New

| Former file | New skill | Token reduction |
|---|---|---|
| `agent-instructions/00-module-analysis.md` | `.github/skills/qa-module-analysis/SKILL.md` | ~2,500 → ~500 + on-demand references |
| `agent-instructions/01-spec-generation.md` | `.github/skills/qa-spec-generation/SKILL.md` | ~2,800 → ~400 + shared references |
| `agent-instructions/02-test-plan-generation.md` | `.github/skills/qa-test-plan/SKILL.md` | ~2,200 → ~400 + test-plan-template |
| `agent-instructions/03-test-case-generation.md` | `.github/skills/qa-test-cases/SKILL.md` | ~2,100 → ~400 + tc-template |
| `agent-instructions/04-automation-generation.md` | `.github/skills/qa-automation/SKILL.md` | ~3,500 → ~500 + patterns + config |
| `agent-instructions/04b-test-stabilization.md` | `.github/skills/qa-test-stabilization/SKILL.md` | ~3,800 → ~500 + classification |
| `agent-instructions/05-ado-integration.md` | `.github/skills/qa-ado-integration/SKILL.md` | ~2,400 → ~400 + scripts |
| `agent-instructions/06-maintenance.md` | `.github/skills/qa-maintenance/SKILL.md` | ~1,700 → ~400 + update-rules |

**Total context reduction**: ~21,000 tokens → ~3,500 tokens (Layer 2 only) + selective Layer 3 loading
