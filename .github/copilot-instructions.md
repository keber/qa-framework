## About this repository

This is the **source code** of `@keber/qa-framework` v1.10.0 - a spec-driven, agent-oriented QA framework published to npm.

### What this repo is

- An npm package (`@keber/qa-framework`) that scaffolds a `qa/` directory structure and installs agent skills into any project that runs `npm install @keber/qa-framework`.
- The framework is NOT a test runner. It is a methodology layer: structure + templates + agent instructions + optional integrations.
- Everything in `skills/` gets copied to `.github/skills/` of the end user's project on install/upgrade.

### How it works

**Install flow:**
```
npm install @keber/qa-framework
  -> postinstall: scripts/init.js --skip-if-exists
     -> creates qa/ (10 subfolders)
     -> copies skills/ to .github/skills/
     -> writes .github/instructions/qa-framework.instructions.md (11 agent rules + pipeline table)
     -> writes qa/AGENT-NEXT-STEPS.md
```

**What the agent in the end-user project receives:**
- `.github/instructions/qa-framework.instructions.md` - 11 behavioral rules + the 6-stage pipeline
- `.github/skills/*.md` - 8 skills loaded on demand (not all at once, to conserve context)

### QA pipeline (6 stages)

| Stage | Skill | Prerequisite |
|---|---|---|
| 1 - Module analysis | `qa-module-analysis` | none |
| 2 - Specifications | `qa-spec-generation` | `00-inventory.md` exists |
| 3 - Test plan | `qa-test-plan` | `05-test-scenarios.md` exists |
| 4 - Test cases | `qa-test-cases` | test plan exists |
| 5 - Automation | `qa-automation` | specs approved, no PENDING-CODE |
| 6 - Maintenance | `qa-maintenance` | app change delivered |
| - | ADO integration | `qa-ado-integration` | ADO enabled in config |

### Source layout

| Folder | Role |
|---|---|
| `scripts/` | CLI commands: `init`, `upgrade`, `generate`, `validate` |
| `skills/` | 8 SKILL.md files - copied to end-user's `.github/skills/` |
| `templates/` | Base templates: specs, test cases, defects, instructions.md |
| `integrations/` | Optional: Playwright, ADO PowerShell, playwright-azure-reporter |
| `qa/` | Live instance of the framework used for this repo's own QA work |
| `.github/skills/` | Skills for this repo's own development work |

### Key design decisions

- **Skills on demand** - the agent loads only the relevant skill for the current task to avoid saturating context.
- **`qa-framework.config.json`** - all project parameterization (modules, test users, integrations) lives here.
- **Safe upgrade** - `npx qa-framework upgrade` overwrites only framework-owned files; never touches user specs, plans, or memory.
- **`INIT_CWD`** - postinstall uses this npm env var to write into the user's project root, not into `node_modules/`.

---

## Formatting rules for generated content
1. Generate the output in `UTF-8` encoding without BOM (`UTF-8`, no signature).
2. Ensure the raw output is `UTF-8` encoded with no `EF BB BF` bytes at the beginning.
3. **Character encoding safety (BLOCKING):** In ALL generated content, never use characters at these Unicode code points: em-dash (U+2014), en-dash (U+2013), horizontal ellipsis (U+2026), smart/curly quotes (U+201C, U+201D, U+2018, U+2019), or directional arrows (U+2190-U+21FF). Use ASCII equivalents instead: ` - ` (hyphen with surrounding spaces) for dashes, `...` for ellipsis, `"` and `'` for quotes, `->` and `<-` for arrows. Exception: Latin Extended characters (U+00C0-U+024F) are always permitted - this covers Spanish vowels with accents (U+00E0-U+00FA), n with tilde (U+00F1/U+00D1), and u/o with umlaut (U+00FC/U+00DC, U+00F6/U+00D6).
