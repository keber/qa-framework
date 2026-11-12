# Write-Safety Policy

> Reference: `qa/00-standards/write-safety-policy.md`
> Applies to every automated test that can change data in a system under test:
> API tests, load and performance tests, and any script or agent that drives them.
> E2E browser tests follow `test-data-guidelines.md`; where a browser test calls an
> API directly to set up or clean up data, this policy applies to that call.

This is the single write policy of the project. API testing conventions and
performance testing guidance reference it; they do not restate or relax it. When
another document disagrees with this one, this one wins until it is changed.

---

## 0. Write approver (fill in before enabling any write)

| Field | Value |
|---|---|
| Write approver (name or role) | `<to be named by the project>` |
| Backup approver | `<optional>` |
| Where approvals are recorded | `<path of the write catalog, see section 2>` |

The framework does not assume who this is. Until a project names an approver
here, no write endpoint can be approved, so the write catalog stays empty and
every test is read-only. The approver is the person who answers for the state of
the QA environment, not the person who wants the test.

---

## 1. Read-only by default

Every automated test is read-only unless it explicitly opts in to writing.

- The default test command runs reads only. Write tests live apart (their own
  folder or tag) and the default command does not even load them.
- A test client that receives a request outside its read catalog rejects it
  before sending anything. "Outside the catalog" includes a known endpoint called
  with a method other than the one catalogued.
- Read endpoints are queries: they carry no side effect. An endpoint whose name
  says query but whose effect is a write (it reserves a number, marks a record as
  seen, triggers a send, generates a file) is a write endpoint for this policy.

## 2. The four write gates

A write request leaves the test client only when all four gates pass, in this
order. Each gate fails closed: on failure the client throws before anything is
sent, and the message names the gate that failed.

| # | Gate | Passes when | Why it exists |
|---|---|---|---|
| 1 | Opt-in | A dedicated environment variable enables writes for this run. It is set only by the separate write-test command, never in shared configuration, `.env` defaults or CI defaults. | Nobody writes by accident: running the usual suite, or a new test copied from a write test, cannot change data. |
| 2 | Approved catalog entry | The endpoint (method and path) is in the project's write catalog with a recorded approval: **who** approved it, **when**, its **scope** (section 3), and how its effect is reverted. Scope `forbidden` never passes. An entry with any approval field missing never passes. | Every write the suite can make was seen and accepted by a named person, and the record of it lives next to the code. |
| 3 | Hard exclusions | The endpoint matches none of the exclusion categories (section 4). Evaluated independently of the catalog, from a list in code. | Adding an endpoint to the catalog, by mistake or under pressure, cannot bypass the cases that must never run. The catalog says what is allowed; the exclusions say what no catalog can allow. |
| 4 | Own records only | The request body targets only records the test itself created, identified by the project's test-record prefix (for example `QA-API-<ENTITY>`). It never modifies a pre-existing record. A lookup that returns more than one candidate fails the test; it does not pick one. | A QA environment is shared and often holds a copy of production data. A write that picks "the first match" eventually edits someone else's record. |

Gates 1 to 3 are checked by the test client from data it holds. Gate 4 depends on
the body each test builds, so the test enforces it: it creates or finds its own
record by exact prefixed name, asserts the lookup returned exactly one, and uses
that record's identifier in the body.

## 3. Scope taxonomy

Every catalog entry declares exactly one scope.

| Scope | Meaning | Allowed |
|---|---|---|
| `isolated` | Verified: the write affects only the target entity's own data in the QA system. No replication, message, file or call to any other system follows from it. | Yes, with approval. |
| `syncs` | The write may replicate to, or trigger, another system. Allowed only when the approval also states that every system it can reach is a non-production instance (name the instances or state why that is known). | Yes, with approval that covers the downstream systems. |
| `forbidden` | The write must never run from automation. Recorded in the catalog so the decision is visible and is not re-proposed. | Never. The client rejects it even with gate 1 open. |

When the downstream effect of a write is unknown, it is `syncs` until proven
`isolated`, and it needs the downstream statement before it can be approved. If
any downstream system is a production instance, the scope is `forbidden`.

## 4. Hard exclusion categories (add-only)

The framework ships these categories as defaults. A project confirms them and may
add categories or patterns; it never removes or narrows one. The list lives in
code, not in project configuration, so that removing an entry is a visible code
change and not an edit to a settings file.

| Category | Covers |
|---|---|
| Email and notifications | Sending email, SMS, push or chat messages, notification queues, mailing lists. |
| Dispatches and legal or customs documents | Shipping dispatches, waybills, invoices, tax or customs documents, and anything that consumes an official document number or folio. |
| Transmission to external or production systems | Endpoints whose purpose is to send, export or synchronise data to a system outside the QA environment, or to any production system. |
| File download or generation | Generating, exporting or downloading files and reports from a write path (they can trigger heavy jobs, consume numbering, or leave artifacts with real data). |
| Bulk operations | Any operation that acts on many records at once: bulk import, mass update, batch reception, "apply to all". |

Projects add their own concrete names (internal system names, route fragments) as
patterns under these categories, in their own code. Those names are project data
and stay in the project.

Matching is conservative: a pattern matches the endpoint path case-insensitively,
and a doubtful match counts as a match. A false positive costs one blocked test
and a conversation with the approver; a false negative can cost a real email or
a real document.

## 5. Lifecycle of a test record when the system has no delete

Many business systems deactivate records instead of deleting them. A test that
creates a new record per run then leaves one inactive record behind per run,
forever. The cycle is therefore idempotent and reuses one record per entity:

1. **Create if absent.** Look up the test record by its exact prefixed name.
   Exactly one found: reuse it. None: create it. More than one: fail (gate 4).
2. **Reactivate** it if a previous run left it inactive.
3. **Exercise** the write under test (for example edit one field and assert that
   only that field changed).
4. **Deactivate** it and assert the final state with a separate read.
5. **Always end inactive.** The cleanup step runs even when a step above fails
   (an `afterAll` or `finally`, not the last step of the test), and its own
   failure is reported, never swallowed.

Cost to declare: each enabled entity leaves **one permanent inactive test record**
in the QA environment. The approval of an entity accepts this cost explicitly,
and the list of enabled entities is the list of records left behind.

When the system does provide delete, the same reuse cycle is preferred. A test
may delete only a record it created (gate 4), and the delete endpoint is itself a
write that needs its own catalog entry.

## 6. Writes under load

This section is shared by API tests and load or performance tests. A load tool
repeats a request many times concurrently, which turns one approved write into
hundreds of real records in seconds.

- **Not load-tested by default.** A write endpoint in a load or performance plan
  runs as a single real call (one virtual user, one iteration) to measure its
  time. All four gates apply to that call.
- **Concurrent write load only on explicit request.** For example, reproducing a
  race condition. It needs all of:
  1. an explicit request from the write approver for that endpoint and that run;
  2. an explicit cap in the plan (maximum iterations or maximum duration, and
     maximum virtual users), never an open-ended ramp;
  3. a confirmation back to the requester before running, restating the
     endpoint, the cap, the expected number of records created and the account
     used, and an explicit go-ahead in reply.
- Records created under load follow section 5: prefixed, owned by the test, and
  left inactive. The number of records left behind is part of the confirmation.
- Any load run, read or write, against the shared QA environment needs a go-ahead
  that states the account or lane it will use: load on reads still degrades the
  environment for everyone else.

## 7. Environment

- Write tests and load tests run only against the QA environment declared in the
  manifest, `qa/qa-framework.config.json` -> `project.qaBaseUrl`.
- The target host of a run must equal the host of `project.qaBaseUrl`. A run whose
  base URL resolves elsewhere does not start.
- Never a production host. A host that looks like production (its name contains
  `prod`, or it is the public address of the live application) is rejected even
  when it is configured.
- A QA environment that holds a copy of production data is still QA for this
  policy, and that is exactly why gate 4 exists. Evidence attached to reports keeps
  status, timing and shape, never field values from those records.

## 8. Changing this policy

- Adding an approval, a catalog entry or an exclusion pattern: the write approver
  records it (section 2), in the same change as the test that uses it.
- Relaxing anything here (removing an exclusion, allowing load on writes by
  default, writing outside the declared QA environment): not done in a project
  file. Raise it with the write approver and the framework maintainers.
