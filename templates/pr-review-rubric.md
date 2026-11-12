<!--
  PR review rubric template - what QA certifies when it approves a pull request
  (@keber/qa-framework).

  How to adopt it:
    1. Replace every {{PLACEHOLDER}}.
    2. Keep, edit or delete the example criteria; add your own with the next free code.
    3. Delete this comment block.

  This file is project-owned. The framework installs it once as
  qa/00-standards/pr-review-rubric.md and never updates it: `init` and `upgrade` only
  create it when it is missing. Write it in the language your QA documentation uses;
  criterion codes (PR-01, PR-I1, ...) stay the same in every language so comments and
  reports can cite them.
-->

# PR review rubric for `{{TARGET_BRANCH}}`

> Version {{VERSION}} ({{DATE}}). Defines what QA certifies when it approves a pull request into
> `{{TARGET_BRANCH}}` in {{REPOSITORIES}}.

---

## 1. What QA approval certifies

Approving a PR into `{{TARGET_BRANCH}}` means the change is **traceable, complete and testable** in
the QA environment. It does not replace the code review by {{CODE_REVIEWER_ROLE}}, which happens
on `{{INTEGRATION_BRANCH}}`.

QA does **not** certify, by approving: internal code quality, design, or that the feature meets
its specification. The specification is verified afterwards, by running the tests on
`{{TARGET_BRANCH}}`.

## 2. Review unit: the work item

A work item is often delivered in several PRs (for example frontend, backend, database). They are
reviewed **together**: the PRs of one work item are approved or returned together, so the target
branch never receives a partial delivery (for example a frontend that calls an endpoint that is not
deployed yet).

## 3. Escalation levels

Each criterion has one of three levels. A new practice usually starts as Informational or Warning
and is **promoted** one level when the team agrees the practice is established; the promotion is a
new version of this document (see the version history). A criterion that cannot be applied yet is
moved to the suspended table with its reason, instead of being deleted.

| Level | Effect on the PR | QA comment |
|---|---|---|
| **Blocking** | If it fails, the vote is **Waiting for author** (`-5`) | Cites the criterion code and what to fix |
| **Warning** | Does not block. The PR is approved | Says the criterion will become blocking in the future |
| **Informational** | Does not block | Recorded only, to measure adoption |

## 4. Blocking criteria

| Code | Criterion | How it is verified |
|---|---|---|
| `PR-01` | The source branch follows `{{BRANCH_PATTERN}}` and its work item ID is a work item linked to the PR | Automatic |
| `PR-02` | The PR has no merge conflicts with `{{TARGET_BRANCH}}` | Automatic (merge status) |
| `PR-03` | Every PR the work item needs (frontend, backend, database) is present, or the PR states that the others do not apply | Grouping by work item + author confirmation |
| `PR-04` | The source branch brings new commits compared with `{{TARGET_BRANCH}}` | Automatic (commits ahead of the target greater than 0) |

`PR-04` exists because chained PRs (each branch starts from the previous one) can end up empty
when another PR already merged their content. An empty PR is abandoned with a comment that names
the PR that brought its content, so the work item keeps its traceability.

## 5. Warning criteria

They do not block today. The QA comment says they will.

| Code | Criterion | Warning text |
|---|---|---|
| `PR-05` | The work item, or its parent User Story, has acceptance criteria or a verifiable description | "PRs linked to work items without acceptance criteria or a verifiable description will not be accepted in the future. QA uses them to design the tests." |
| `PR-06` | Every commit follows conventional commits and carries the work item ID | "PRs with commits that do not follow conventional commits or do not carry the work item ID will not be accepted in the future." |
| `PR-07` | The PR description says what changes and how to test it; if it touches the database, it states the data or schema impact | "In the future the PR description must say how to test the change." |

A criterion about the work item itself (like `PR-05`) belongs before the work reaches
`{{INTEGRATION_BRANCH}}`, not in the PR. Until that earlier check exists, QA warns in the PR.

## 6. Informational criteria

| Code | Criterion |
|---|---|
| `PR-I1` | Adds or updates unit tests |
| `PR-I2` | Size of the change (files changed); above {{MAX_FILES}} files, suggest splitting |
| `PR-I3` | The PR is not a draft |
| `PR-I4` | The source branch already went through `{{INTEGRATION_BRANCH}}` |

## 7. Suspended criteria

A criterion that the team cannot apply yet. It keeps its code, so reports stay comparable, and
records the condition to resume it.

| Code | Criterion | Reason |
|---|---|---|
| `{{CODE}}` | {{CRITERION}} | {{WHY_IT_IS_SUSPENDED}}. Resume when {{CONDITION_TO_RESUME}} |

## 8. Vote and comments

| Result | Vote |
|---|---|
| Every blocking criterion passes | Approved (`10`), with the applicable warnings in one comment |
| A blocking criterion fails | Waiting for author (`-5`) + a comment with the failing codes |
| The change does not belong in `{{TARGET_BRANCH}}` | Rejected (`-10`) + a comment |

The vote values are the Azure DevOps ones. On other platforms use the equivalent: approve,
request changes, or close with a comment.

Rules for comments:

- **One comment per PR**, grouping every warning. Several separate comments are noise.
- Where branch policy requires comments to be resolved before merge, **publish a warning comment
  in Closed or Resolved state**. An Active warning comment blocks the merge even on an approved PR.
- Before commenting on a check or status of the PR, read its **latest** value: one check can post
  several successive statuses (for example `pending`, then `notApplicable`).

## 9. Known limitations

Record here what the rubric cannot verify today and why (for example a build validation policy
that is disabled on `{{TARGET_BRANCH}}`, or a required reviewer that is a person instead of the QA
group). Date the section; each review report cites it instead of repeating it.

- {{LIMITATION}} (as of {{DATE}})

## 10. Review report template

Each application of this rubric produces one report in
`qa/05-test-execution/pr-reviews/{{YYYY-MM-DD}}-prs-{{TARGET_BRANCH}}.md`. Get the date from the OS
clock (`npx qa-framework clock`), never from memory.

```markdown
# PR review into `{{TARGET_BRANCH}}` - {{YYYY-MM-DD}}

> Application of pr-review-rubric.md v{{VERSION}}. Source: {{SOURCE}}, read only.
> Extracted {{YYYY-MM-DD HH:MM}} ({{TIME_ZONE}}). Published: {{VOTES_AND_COMMENTS_OR_NOT_YET}}.

## Summary

- How many PRs, grouped into how many work items.
- Verdict: whether every blocking criterion passes, and the suggested vote.
- The main risk for QA, in one line.

## 1. PRs reviewed

| Work item | Title | {{PR_COLUMNS}} |
|---|---|---|

## 2. Verdict by criterion

One row per criterion and level, with concrete evidence (PR, commit, field or API value):
never a verdict without the evidence that supports it.

### Blocking

| Criterion | Result | Evidence |
|---|---|---|

### Warning

| Criterion | Result | Evidence |
|---|---|---|

### Informational

| Criterion | Measurement |
|---|---|

## 3. Observations for QA

What the merge does to QA's own work: integration order, manual deployment steps, test cases that
become obsolete, acceptance criteria superseded by a later work item, test data to prepare.

| # | Observation | Effect |
|---|---|---|

## 4. Limitations of this analysis

What was not verified and how each criterion was actually evaluated (for example: a commit
message read from an API that may truncate it; a criterion accepted from the absence of changes
rather than from an author statement; code not reviewed and builds not run).
```

Sections 3 and 4 of the report keep QA judgement apart from the mechanical verdict and declare
the real scope of the evidence. Do not drop them when nothing is found: write "None".

## Version history

| Version | Date | Change |
|---|---|---|
| {{VERSION}} | {{DATE}} | Initial version |
