# Credential policy for Azure DevOps access

Guidance for storing and using the credentials that QA tooling needs to reach Azure DevOps
(ADO). It applies to every script, agent session and pipeline of a QA repository that uses
the `qa-ado-integration` skill. The framework ships no loader: this document describes the
policy a project's own loader, `config.ps1` or pipeline should implement.

## 1. Principles

- **Least privilege.** Every process holds only the credential it needs, with the narrowest
  scope and the shortest lifetime that still lets it do its job. A tool that only reads work
  items never holds a token that can write.
- **Separate by lifetime and blast radius.** A credential that is valid for the whole
  organization and lives for months is not stored next to a test-user password that only
  matters to one project.
- **Names are versioned, values never are.** The repository records which variables a
  project needs; the values stay outside it.
- **One place per value.** Each secret exists in exactly one location, so rotating it is one
  edit.

## 2. Three tiers

The tiers are ordered by blast radius (how much an attacker reaches with the credential) and
by lifetime (how long it stays valid). The higher the blast radius, the further the value
stays from the repository.

| Tier | Contents | Blast radius | Lifetime | Secret | Versioned |
|---|---|---|---|---|---|
| **Identity** | `ADO_ORG`, the PAT (`ADO_PAT_READ`, `ADO_PAT_WRITE`, or a single `ADO_PAT`) | Every project the account can reach in the organization | Months (until the PAT expires) | Yes | Never |
| **Context** | Organization name, read and write project names, and the **names** of the environment variables each role uses (for example `envVarEmail`, `envVarPassword` in `testUsers[]`) | None: it holds no secret | As long as the project | No | Yes, in `qa/qa-framework.config.json` |
| **Secrets** | Per-project values: test-user passwords, webhook URLs, API keys of the system under test | One project | Until the project rotates them | Yes | Never |

Why the split matters:

- A PAT is scoped to an organization (or to all organizations), not to a project. Storing it
  in each project's secrets file duplicates it once per project, and rotating it becomes a hunt
  through several files. Kept in the identity tier, it lives in one place.
- Project names and variable names are not secrets. In the versioned config a reviewer can see
  them, and every clone and worktree gets them without copying anything.
- Adding a project means adding one secrets file. The identity tier is not touched.

## 3. Where each tier lives

| Tier | Developer machine | CI pipeline |
|---|---|---|
| Identity | A file in the user profile, outside every repository (for example `~/.ado/identity.ps1`), or the OS secret store. Loaded into the **process** environment variables of the session that needs it | A pipeline secret variable, or a variable group linked to a vault (for example Azure Key Vault). When the job only talks to its own organization, prefer the job access token the pipeline already provides over a personal PAT |
| Context | `qa/qa-framework.config.json`, versioned | The same file, from the checkout |
| Secrets | A per-project file in the user profile (for example `~/.ado/projects/<profile>.ps1`), or a gitignored file at the repository root (for example `config.ps1`, `.env`) | Pipeline secret variables or a vault-linked variable group, mapped into the job as environment variables |

Notes:

- An environment variable set **inside a process** (by a loader the session dot-sources) dies
  with the process. A variable persisted in the user or machine environment does not: see the
  hard rules.
- A gitignored file at the repository root is the simplest option, but a new worktree does not
  get it (only tracked files are materialized). The fix is a loader that resolves the
  repository with `git rev-parse --show-toplevel` and reads the profile files from the user
  profile, not a copy of the file into the worktree.
- In a pipeline, mark every secret variable as secret so the agent masks it in logs, and map
  it into the step explicitly; secret variables are not exposed to scripts automatically.

A loader that composes the tiers should, at the end, report each expected variable as present
or missing **by name**, never printing a value or a fragment of it.

## 4. Context in the config

The context tier records names, never values. The test-user indirection already in the
config is the model:

```json
"testUsers": [
  { "role": "admin", "envVarEmail": "QA_USER_ADMIN_EMAIL", "envVarPassword": "QA_USER_ADMIN_PASSWORD" }
]
```

`integrations.azureDevOps.organization` and `integrations.azureDevOps.project` hold
placeholders or the real (non-secret) names. A project that reads from one ADO project and
writes to another records both names where its team can review them; the framework scripts do
not read a second project key yet (see section 5).

## 5. Read and write access

QA tooling does two different things against ADO, often in two different projects:

- **Read**: work items, User Stories, pull requests and code of the product team. Gap analysis,
  the work item full-read protocol and PR reviews only read.
- **Write**: test plans, suites, test cases, test results, defects and comments, usually in the
  project where QA keeps its artifacts.

A single `ADO_PROJECT` and a single `ADO_PAT` cannot express this. Split both into read and
write variables:

| Variable | Holds | Used by |
|---|---|---|
| `ADO_PROJECT_READ` | The project QA reads from | Every read: work items, PRs, code |
| `ADO_PROJECT_WRITE` | The project QA writes its artifacts to | Every write: test plans, test cases, results, defects |
| `ADO_PAT_READ` | A PAT with read scopes only (for example Work Items: Read, Code: Read, Test Management: Read) | Read-only tooling and agent sessions that only analyse |
| `ADO_PAT_WRITE` | A PAT with the write scopes the write scripts need (for example Work Items: Read and write, Test Management: Read and write; Code: Read and write only to vote or comment on PRs) | Only the scripts that create or update ADO content |

Rules for the split:

- **Read-only tooling never holds write scope.** A session that only analyses work items or
  reviews PRs loads `ADO_PAT_READ` and nothing else. If such a session is compromised or an
  agent misbehaves, the token cannot create, edit or delete anything.
- **Use the explicit variable whenever the direction matters.** A read uses
  `ADO_PROJECT_READ`; a write uses `ADO_PROJECT_WRITE`. Do not assume a generic `ADO_PROJECT`
  points at the right project for a read.
- **A project name is a target, not an access control.** `ADO_PROJECT_WRITE` tells a script
  where to write; it does not stop a write-scoped PAT from writing anywhere else the account can
  reach. PAT scopes cannot be limited to one project. Real isolation comes from the identity's
  permissions in ADO (project membership and security groups) plus the read-only PAT for tools
  that do not write.
- **Fallback for existing scripts.** The framework scripts and many project scripts still read
  `ADO_PROJECT` and `ADO_PAT`. A loader keeps them working by setting, in the process that runs
  a given script, `ADO_PROJECT` to the read or write project and `ADO_PAT` to the read or write
  PAT that script needs. Set them per process, never globally, so a read-only session never
  inherits the write PAT through the fallback.
- When one project serves both directions, set both project variables to the same name; keep
  the two PATs separate anyway.

## 6. Rotation

- Create every PAT with the shortest expiry the team can sustain; the organization policy may
  cap it. Put a reminder before the expiry date: an expired PAT surfaces as a `401` in the
  middle of a sync.
- Because each value lives in one place, rotating the PAT is one line in one file (identity
  tier) or one pipeline variable. Never rotate by search and replace across repositories.
- On a suspected exposure (a PAT pasted in a chat, a log, a commit or an agent prompt):
  **revoke** it in ADO first, then issue a new one. Deleting the text does not invalidate the
  token; removing a commit from history does not either.
- Rotate per-project secrets (test-user passwords, webhooks) on the system owner's schedule
  and whenever someone with access leaves the project.
- After a rotation, run the loader's missing-variable report and one read-only call to confirm
  the new value works, without printing it.

## 7. Hard rules

- NEVER persist a PAT or any other secret as a user or machine environment variable. On
  Windows, `HKCU\Environment` is readable by every process running as that user, a wider
  exposure than a file with a restricted ACL. Persisting a **path** to a loader is fine; it is
  not a secret.
- NEVER copy a credential file into a repository or a worktree. A worktree works because the
  loader finds the files in the user profile, not because it holds a copy.
- NEVER hardcode a credential in a script, a `settings.json`, a committed config file, a test,
  documentation or an agent prompt. Documentation uses `<PLACEHOLDER>` values.
- NEVER print a secret. Report variables by name and, if useful, by length; never by value.
- Restrict the credential folder in the user profile to its owner (on Windows, remove
  inheritance and grant full control to the owning user only; on Linux and macOS,
  `chmod 700` on the folder and `chmod 600` on its files). Preserve the restriction when adding
  files.
- Give read-only sessions and sub-agents only the read variables. Hand the write PAT only to the
  step that writes.

## 8. Checklist

- [ ] The PAT lives in exactly one place outside every repository (or in a pipeline secret).
- [ ] `qa/qa-framework.config.json` holds names only; no value of a secret is versioned.
- [ ] Read-only tooling runs with `ADO_PAT_READ`; only write steps receive `ADO_PAT_WRITE`.
- [ ] Reads target `ADO_PROJECT_READ`, writes target `ADO_PROJECT_WRITE`.
- [ ] No secret is persisted as a user or machine environment variable.
- [ ] The credential folder is restricted to its owner.
- [ ] Every PAT has an expiry date and a reminder before it.
- [ ] The loader reports missing variables by name, never by value.
