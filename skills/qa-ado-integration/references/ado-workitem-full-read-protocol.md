# Reference: ADO Work Item Full-Content Read Protocol

> Loaded by `skills/qa-ado-integration/` whenever an agent reads an Azure DevOps work item in
> order to reach a conclusion about it. **BLOCKING**: no verdict about a work item is valid until
> this protocol has been applied to it.

This file has three parts:

1. **The protocol** - the contract. Tool-agnostic: it says what must be read and why, not how.
2. **Local cache convention** - where the content read from ADO is kept between sessions.
3. **Example implementation** - one way to apply the protocol, with PowerShell and the separate
   `@keber/ado-powershell` package, plus the equivalent REST calls for any other tool.

---

## Part 1 - The protocol (tool-agnostic contract)

### When it applies

Before classifying, scoping, or writing ANY conclusion about an ADO work item of type **Task,
Bug, Issue, or User Story** (and the equivalent requirement types of other process templates, for
example Product Backlog Item in Scrum) - for gap analysis, spec generation, coverage decisions, or
tracing a change back to the work item that authorized it. This covers verdicts such as "already
covered", "not covered", `PENDING-CODE`, "outdated", "process gap", "new screen", "not built", or
any similar conclusion.

It applies in:

- Gap analysis and traceability work.
- Stage 1 and Stage 2 (`qa-module-analysis`, `qa-spec-generation`) whenever an ADO ID is what
  triggers exploring a module or submodule.
- Any sub-agent delegated ADO-related research. The protocol applies identically whether the main
  agent or a sub-agent performs the read (see "Provisional verdicts" below).

### Why it exists

Three field incidents, all from projects using this framework with ADO:

- **Title-only classification.** Two sibling Tasks were classified as "process gap - not found in
  the menu" from `System.Title`, `System.State` and `System.ChangedDate` alone. Reading the full
  description, including its embedded mockups, showed that both described NEW SECTIONS added to an
  EXISTING screen, not new standalone screens. Both were children of the same parent, and both
  mockups showed the same screen. The whole menu-search method had been checking for the wrong
  thing.
- **The User Story was read by luck.** While tracing a UI change, the business expectation lived
  in the parent User Story of three Tasks, not in the Tasks themselves. The sub-agent read it on its
  own judgment, because the protocol of the day listed only Task, Bug and Issue. Correct coverage
  depended on luck, not on the rule. A User Story is frequently the ONLY place where the full
  business expectation is written, because its child Tasks each describe a partial facet.
- **A text search is not a negative.** A full-text search over work item descriptions found no
  mention of a change and concluded there was no authorization for it. The search could never have
  found a change that exists only inside a mockup image. A second, complete investigation that
  looked at the images was needed before that negative became auditable.

### The five points (BLOCKING)

Read all five before concluding. Skipping one is not a shortcut, it is a different and weaker
conclusion.

1. **Identity and outcome: Type, Title, State, Reason.** Not just State. `System.Reason`
   distinguishes "Completed" from "Removed", "Duplicate" or "Cut", which changes the interpretation
   completely: a Closed item that was cut is not delivered functionality.
2. **The full content fields, as written.** The actual requirement text, not the title. Which
   field carries it depends on the type:
   - `System.Description` for every type.
   - `Microsoft.VSTS.TCM.ReproSteps` for a Bug - Bugs usually keep their content there and leave
     Description empty.
   - `Microsoft.VSTS.Common.AcceptanceCriteria` for a User Story or Product Backlog Item - the
     acceptance criteria are often the most testable statement of the expectation.
   - Any other rich-text field the team fills in for that type.

   These fields are HTML. Read all of each one; do not stop at the first paragraph.
3. **Every image.** Content fields frequently embed UI mockups inline as
   `<img src=".../_apis/wit/attachments/{guid}?fileName=...">` tags (sometimes as base64 `data:`
   URIs instead), and some teams attach image files to the work item rather than embedding them.
   Download every embedded image from every content field, and every image file attached to the
   item, then **look at each one** before concluding. A mockup is often the ONLY place that
   reveals whether a work item is a new screen, a new section on an existing screen, or a
   logic-only change with no new UI at all. A description that looks near-empty as text may carry
   the whole requirement in a picture.
4. **All comments.** Clarifications and scope changes are often discussed after the item was
   created and never copied back into the description. Read every page of comments, not the first.
5. **The parent/child hierarchy.** `System.LinkTypes.Hierarchy-Reverse` (parent) and
   `System.LinkTypes.Hierarchy-Forward` (children).
   - **Apply this same protocol to the parent** when it is a User Story, Product Backlog Item, or
     Feature that carries requirement text. That is where the business expectation usually lives.
   - **Read at least points 1 and 2 of every sibling and child.** Siblings under one parent often
     describe different facets of the SAME screen. Read them fully when they bear on the verdict.

### Rules of inference

- **Never** conclude "new screen", "not built" or "process gap" from title-matching against a menu
  dump. A missing menu entry only tells you the item is not a new top-level menu entry. It does NOT
  tell you whether the described functionality exists as a section within an already-covered
  screen. Iterative development commonly adds business logic and new sections onto stable,
  already-shipped screens rather than shipping new standalone pages. Assume this is possible for
  every item until the full content says otherwise.
- **A text search that found nothing is not a negative** while images exist that were neither
  looked at nor described. State what the search could not see.
- **Reason before State.** Interpret State only together with Reason.

### Provisional verdicts

If an agent or sub-agent could not reach ADO (for example, credentials missing in its environment)
and fell back to title-only or partial information, its conclusion MUST be marked explicitly as
**provisional**, naming which of the five points were not read. It is pending a full-content
re-read once ADO access works. A provisional verdict is never accepted as final, and a parent
agent never promotes a sub-agent's provisional verdict to a final one.

### What to report

When a verdict depends on a work item, report what was actually read, as counts rather than a
compliance claim:

```
WI <id> (<type>) - State/Reason: <state>/<reason>
  content fields read: Description, AcceptanceCriteria
  images: 3 found, 3 viewed, 3 described
  comments: 7 read
  parent: <id> (User Story) read with this protocol; siblings: 2 read (points 1-2)
```

---

## Part 2 - Local cache convention

Keep what was read so later sessions can reuse it without re-querying ADO every time the item
comes up. Suggested location (keep one location per project):

```
qa/01-specifications/source/ado-workitems-cache/
  _manifest.json              when each item was fetched (see "Timestamps" below)
  {id}/
    description.html          raw content field(s) as returned by ADO
    description.txt           decoded / cleaned text
    acceptance-criteria.html  when the type has acceptance criteria
    inline-N.<ext>            each image, in document order
    inline-N.description.md   one paragraph: what image N shows
    comments.json             optional
    relations.json            optional
```

**Describe every image in text.** Write `inline-N.description.md` in the same step where image N
is looked at. Without it the cache cannot be searched, every future session has to look at every
mockup again, and a keyword search over the cache can never find a change that exists only in a
picture. The visual read is already paid for; the paragraph is cheap. It also makes a negative
("no mockup shows this button") cheap and auditable on the first pass.

**Cache validity.** Treat a cached copy as valid unless there is a specific reason to suspect the
content or the images changed. A change of `System.ChangedDate` or `System.Rev` alone does not
mean the content changed: state transitions (for example, closing the item) update both. Known
limitation: there is no content hash yet to detect whether a re-fetch actually changed anything.

**Timestamps.** Record when the cache was taken from the system clock, never from a date typed
from memory. Keep the timestamp **out of the per-item files**: put it in `_manifest.json` (and an
index column, if the project keeps an index). A timestamp inside every item file makes a
byte-for-byte diff of that file differ on every re-cache even when nothing changed, which is the
same churn the previous paragraph says must not force a re-read.

**Verbatim transcription.** Titles and text authored in ADO may contain arrows, typographic
quotes, or unaccented Spanish. Transcribe them **as they are** in the cached item files: rewriting
them breaks the exact correspondence with ADO that the cache exists to preserve, and a test case
citing a work item must be able to find it by its real title. Rule 11 of
`qa-framework.instructions.md` (character encoding safety) still governs every line of prose the
agent writes around the transcription: notes, warnings, READMEs, specs. Exclude the transcribed
item files from character checks narrowly - the item files only, never the whole tree.

**Encoding.** Write the cache files (`.md`, `.json`, `.html`, `.txt`, `.csv`) as UTF-8 without
BOM. On Windows PowerShell 5.1 both `Set-Content -Encoding UTF8` and `Export-Csv -Encoding UTF8`
write a BOM; use an explicit `New-Object Text.UTF8Encoding($false)` writer instead. Also,
`[IO.File]::ReadAllText` **without** an explicit encoding decodes with the ANSI code page and makes
correctly accented UTF-8 content look corrupted - a verification script that omits the encoding
argument reports false failures.

---

## Part 3 - Example implementation

### PowerShell with `@keber/ado-powershell`

> **Dependency.** This recipe uses functions from **`@keber/ado-powershell`**, a separate npm
> package that installs its own `ado-powershell` skill under `.github/skills/ado-powershell/`.
> It is NOT shipped by `@keber/qa-framework`: the scripts in this framework's
> `integrations/ado-powershell/` are different (test plan creation, ID injection, title sync).
> The recipe was checked against `@keber/ado-powershell` **1.5.0**. `Get-AdoWorkItemContentHtml`,
> `Save-AdoInlineImage` and `ConvertFrom-AdoHtml` live in its `scripts/ado-content.ps1`, which
> version 1.4.0 does not ship. With an older version, or with any other tool, use the REST calls
> in the next section.

Requirements: `ADO_ORG` plus the read pair `ADO_PROJECT_READ` and `ADO_PAT_READ` set in the
environment (never hardcoded), each falling back to `ADO_PROJECT` / `ADO_PAT` when not set. This
recipe only reads, so it never needs the write PAT (see `credential-policy.md`, section 5). Run
the loader and the queries in ONE PowerShell invocation - write one `.ps1` script - because the
session object the functions rely on does not survive between separate invocations.

```powershell
# Read-only: load.ps1 reads ADO_PROJECT and ADO_PAT, so point them at the read pair in THIS process.
if ($env:ADO_PROJECT_READ) { $env:ADO_PROJECT = $env:ADO_PROJECT_READ }
if ($env:ADO_PAT_READ)     { $env:ADO_PAT     = $env:ADO_PAT_READ }
. .github/skills/ado-powershell/load.ps1    # initializes the session from ADO_* env vars

$id      = <ID>
$project = if ($env:ADO_PROJECT_READ) { $env:ADO_PROJECT_READ } else { $env:ADO_PROJECT }    # holds the work items
$cache   = "qa/01-specifications/source/ado-workitems-cache/$id"

$wi = Get-AdoWorkItem -Id $id -Project $project    # -Expand All is the default: fields + relations

# 1: identity and outcome
$wi.fields.'System.WorkItemType'
$wi.fields.'System.Title'
$wi.fields.'System.State'
$wi.fields.'System.Reason'

# 2: content fields - read all of each one
$content  = Get-AdoWorkItemContentHtml -WorkItem $wi    # ReproSteps for a Bug, else Description
$criteria = Get-AdoFieldValue -WorkItem $wi -Name 'Microsoft.VSTS.Common.AcceptanceCriteria' -Default ''
ConvertFrom-AdoHtml $content
ConvertFrom-AdoHtml $criteria
# For a Bug that has both, also read $wi.fields.'System.Description': the helper returns only one.

# 3: every image - embedded in the content, plus image files attached to the item
$images = Save-AdoInlineImage -WorkItem $wi -OutDirectory $cache -IncludeAttachedFiles
if ($criteria) {
    $images += Save-AdoInlineImage -Html $criteria -OutDirectory $cache -BaseName 'criteria'
}
$images    # look at every file, then write inline-N.description.md for each

# 4: comments
Get-AdoWorkItemComments -Id $id -Project $project

# 5: hierarchy - then run this same recipe on the parent
$wi.relations | Where-Object rel -like 'System.LinkTypes.Hierarchy*'
```

Notes on the recipe:

- Earlier field versions of this recipe extracted image URLs with a regular expression over
  `System.Description` and downloaded them with `Invoke-AdoDownload`. That misses Bug ReproSteps,
  acceptance criteria, attached image files, `data:` URIs, and host-relative URLs; and a URL
  without `download=true` can return a document wrapper instead of the image bytes. Prefer
  `Save-AdoInlineImage`, which handles all of these.
- `Get-AdoWorkItemComments` returns a single page of comments. For an item with a very long
  discussion, use the REST call below and follow `continuationToken`.
- If work items are read from a different project than the one test artifacts are written to,
  pass that project explicitly with `-Project`; otherwise the session default is used.

### Equivalent REST calls (any tool)

All calls use the read PAT (`ADO_PAT_READ`, else `ADO_PAT`) as Basic authentication (empty user
name), read from the environment; `{project}` is `ADO_PROJECT_READ`, else `ADO_PROJECT`.

| Point | Call |
|---|---|
| 1, 2, 5 | `GET https://dev.azure.com/{org}/{project}/_apis/wit/workitems/{id}?$expand=all&api-version=7.1` - fields are under `fields`, links under `relations` |
| 3 | For each `<img src>` in every content field and each `AttachedFile` relation whose name is an image: resolve host-relative URLs against `https://dev.azure.com`, append `api-version` and `download=true` when absent, then `GET` it with the same authentication. Decode `data:` URIs locally |
| 4 | `GET https://dev.azure.com/{org}/{project}/_apis/wit/workitems/{id}/comments?api-version=7.1-preview.3` - repeat with the returned `continuationToken` until none is returned |
| 5 | Parent: the relation with `rel` = `System.LinkTypes.Hierarchy-Reverse`; children: `System.LinkTypes.Hierarchy-Forward`. The work item ID is the last segment of each relation `url`; fetch each one with the first call |
