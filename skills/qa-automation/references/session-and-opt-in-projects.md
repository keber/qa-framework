# Sessions and opt-in projects

Scaffold files: `qa/07-automation/e2e/global-setup.ts`, `playwright.config.ts`,
`fixtures/auth.ts`, `scripts/run-opt-in.js` (installed by `init`, delivered by
`upgrade` when the project still has the framework's copy).

## Rule 1 - login only in global setup

Tests never log in. `global-setup.ts` logs each lane in once and saves the session as
`storageState`; every lane project in `playwright.config.ts` starts its tests from that
file.

**Why.** The config keeps `trace`, `video` and `screenshot` on failure, because a failed
run without them cannot be diagnosed. A login inside a test would put into those
artifacts:

- the trace: every action with its arguments, and the network log, which holds the
  login request body - password included;
- the video and the screenshots: the login form as it was typed.

Artifacts are uploaded by CI, attached to defects and to Azure DevOps runs, and shared.
Hiding the password from `fill()` with `page.evaluate()` (Pattern 7 in `patterns.md`)
removes one leak, not the request body. The only complete fix is that no login ever
happens where artifacts are recorded.

**Where the login is safe.** `globalSetup` is a plain function that runs outside the test
runner, in a browser it launches itself. The `use` options of the config (trace, video,
screenshot) do not apply to it, so nothing is recorded. Keep it that way:

- never start tracing, record video or HAR, or take screenshots in `global-setup.ts`;
- do not move the login into a setup test (`auth.setup.ts`): a test is recorded with
  the project's options. The scaffold's `setup` project records nothing for the same
  reason;
- a login that cannot confirm it reached the application fails the setup; it never
  saves a session it did not verify.

**Several roles.** One role per lane: add a lane whose account has that role
(`parallelLanes.lanes` in `qa-framework.config.json`). Its `storageState` is wired into
its lane project automatically. Never switch users inside a test.

**Testing the login flow itself.** That is the one test that must type credentials.
Put it in a `*.login.spec.ts` file; it runs only in the opt-in `login-flow` project,
which records no trace, video or screenshot and holds no session:

```typescript
// tests/auth/sign-in.login.spec.ts
import { test, expect } from '@playwright/test';
import { loginAs } from '../../fixtures/auth';

test('a valid user reaches the dashboard', async ({ page }) => {
  await loginAs(page, 'default');
  await expect(page.getByRole('navigation')).toBeVisible();
});
```

`loginAs()` refuses to run, before touching the page, in a project that records any
artifact and outside a running test. It checks the project's options, so never turn
capture back on with `test.use()` in a login spec. Use an account no lane holds, or the
lane you reserved: a login invalidates any other session of the same account.

## Rule 2 - expensive or risky suites are opt-in

Suites that write, slow suites and the login flow are opt-in projects: `npm test` never
registers them, so they run only when someone selects them on purpose.

| Project | Files | Variable | Session |
|---|---|---|---|
| `login-flow` | `*.login.spec.ts` | `QA_RUN_LOGIN_FLOW` | none, records nothing |
| `writes` | `*.writes.spec.ts` | `QA_RUN_WRITES` | lane, after `setup` |
| `slow` | `*.slow.spec.ts` | `QA_RUN_SLOW` | lane, after `setup` |

Every lane project ignores those suffixes, so an opt-in test can live next to the
module's other specs without ever running in the default suite. A file with a different
suffix is a default test: name the file before writing it.

**Selecting one** - any of the three works the same on Windows and Linux:

```bash
npm run test:writes                       # node scripts/run-opt-in.js writes
npx playwright test --project writes
```

or set `QA_RUN_WRITES=1` in the environment (CI variables, `.env` of the job runner).
The variable is `QA_RUN_` plus the project name upper-cased, `-` as `_`.

**Why a Node launcher.** Setting a variable inline in an npm script is shell syntax:
`QA_RUN_WRITES=1 playwright test` works in `sh` and fails in `cmd.exe`. `run-opt-in.js`
starts the Playwright CLI with `spawnSync` and no shell, passes `--project <name>`, sets
`QA_RUN_<NAME>=1`, and forwards any extra argument unchanged (`-g "<title>"`).
`--dry-run` prints the command without running it.

**How the config sees the selection.** `playwright.config.ts` reads `QA_RUN_<NAME>` and
the `--project` arguments, registers the selected projects, and writes the variable
back to the environment. Playwright workers re-load the config without the runner's
`--project`, but they inherit its environment, so both register the same projects.
This logic lives in `resolveOptInProjects()` in `scripts/global-setup-guards.js`.

**Adding one.** Add an entry to `OPT_IN_PROJECTS` in `playwright.config.ts` (name, file
suffix, `lane: true` when it needs a session), name its files with the suffix, and add
`"test:<name>": "node scripts/run-opt-in.js <name>"` to `package.json`. A project that
writes follows `qa/00-standards/write-safety-policy.md` before its first run.

## Upgrade notes

- `upgrade` never edits `package.json`: when the `test:login-flow`, `test:writes` or
  `test:slow` script is missing it prints the lines to add.
- `upgrade` lists every `loginAs(` call outside a `*.login.spec.ts` ("Login safety").
  While any exists, a pristine `fixtures/auth.ts` is not refreshed, so those tests keep
  running; move them to `storageState` and run `upgrade` again.
- `upgrade` does not refresh a pristine `playwright.config.ts` while a spec under
  `tests/` already ends in `.login.spec.ts`, `.writes.spec.ts` or `.slow.spec.ts`: the
  new config would move those files out of `npm test` without anyone deciding it. It
  lists them; rename them, or accept the move by copying the config from the package
  template by hand (a `*.writes.spec.ts` then follows the write-safety policy). In a
  project without lane scripts yet, this keeps the whole older setup.
