# Reference: Output Verification (measure, do not assert)

> Shared by every skill that generates documentation: `qa-module-analysis`, `qa-spec-generation`,
> `qa-test-plan`, `qa-test-cases`.

A compliance claim is not evidence. When a stage ends, report the **command output** that proves the
artifact is correct - never the sentence "it complies".

This exists because the failure it prevents is measured, not hypothetical. In one project a
sub-agent wrote 5 memory files, 5 index rows and a task section entirely without Spanish accents,
then reported explicitly that it had complied with the accent rule - the rule having been passed to
it in full. The defect was caught only because the orchestrator ran the count by hand. Asked for the
count instead of the claim, the same agent produced the real numbers and corrected itself.

---

## Run before closing any stage that wrote a `.md`

Replace `<file>` with each file the stage created or modified.

```bash
# 1. Spanish orthography - accented characters must be present in Spanish prose.
#    A Spanish document scoring 0 is defective, not stylistically different.
rg -c '[áéíóúÁÉÍÓÚñÑüÜ]' <file>

# 2. Forbidden characters - must return nothing.
#    em-dash, en-dash, ellipsis, smart quotes, arrows.
rg -n $'[\u2013\u2014\u2018\u2019\u201c\u201d\u2026\u2190-\u21ff]' <file>

# 3. No BOM - must not print EF BB BF.
head -c3 <file> | od -An -tx1
```

Report the actual numbers per file. If a count is missing, the stage is not closed.

Check 1 is also available as a script that classifies the file's language first, so English
artifacts are not asked for accents they should not have:

```bash
node node_modules/@keber/qa-framework/scripts/check-spanish-accents.js <file|dir>
node node_modules/@keber/qa-framework/scripts/check-spanish-accents.js --staged   # pre-commit
node node_modules/@keber/qa-framework/scripts/check-spanish-accents.js --report <paths>
```

It exits 1 when a Spanish file has no accented characters. Wire the `--staged` form into a
pre-commit hook to make the rule a control rather than an expectation.

---

## Why the accent check is not cosmetic

Specs written without accents propagate into automation. Page objects locate fields by their visible
label, so a spec that says `Codigo` while the UI renders `Código` produces a selector that never
matches. In one project this caused 24 of 39 smoke tests to fail, and cost two wrong mitigations
(raising a timeout, forcing HTTP/1.1) before the real cause was found - because the failure presents
as a timeout, not as a text mismatch. See `skills/qa-automation/references/pom-template.md`.

Write the accents at the source. Every downstream stage inherits them.

---

## Language boundary

Spanish artifacts (specs, plans, test cases, reports, defect files) must carry Spanish orthography.

Artifacts that are legitimately English - the framework's own skill files, English documentation -
score `0` on check 1 and that is correct. Never fabricate Spanish prose to satisfy the metric; report
the language of the artifact and move on. The check applies to content that **is** Spanish, and
`conventions.language` in `qa/qa-framework.config.json` says which that is.
