# Test Data Guidelines

> Reference: `qa/04-test-data/`  
> All test data definitions must follow these rules. No exceptions for credentials.

---

## Rules

### 1. Never hardcode credentials

All user emails, passwords, API keys, and tokens must come from environment variables.

```typescript
// ✅ CORRECT
const email    = process.env.QA_USER_EMAIL!;
const password = process.env.QA_USER_PASSWORD!;

// ❌ WRONG — never commit credentials
const email    = 'admin@example.com';
const password = 'secret123';
```

Document env var names in `qa/04-test-data/users.md`. Use `<PLACEHOLDER>` for values in all documentation.

### 2. Use EXEC_IDX for unique values per run

Never create records with static names — they collide between runs and can leave leftover data.

```typescript
const EXEC_IDX = Math.floor(Date.now() / 60_000) % 100_000;

// Names / codes
const name = `Test-Entity-${EXEC_IDX}`;

// Future-safe dates (year 2120+ avoids real production data overlap)
const year  = 2120 + (EXEC_IDX % 10);
const month = String((EXEC_IDX % 12) + 1).padStart(2, '0');
const day   = String((EXEC_IDX % 28) + 1).padStart(2, '0');
const date  = `${year}-${month}-${day}`;
```

### 3. Provision in `beforeAll`, not `beforeEach`

Create required records once per suite, not once per test. Each test that **consumes** a record needs its own provisioned record — never share a single record among multiple tests.

```typescript
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  // If 3 tests each need 1 record, create 3:
  for (let i = 0; i < 3; i++) {
    await createEntity(page, `Record-${EXEC_IDX}-${i}`);
  }
  await page.close();
});
```

### 4. Seed scripts go in `04-test-data/seeders/`

Complex setup that cannot be done via the UI goes in a seeder script, not inside a spec file.

```
qa/04-test-data/
├── users.md          ← Role catalog + env var names (no real values)
├── fixtures/         ← Static JSON/Markdown for reference data
├── factories/        ← Dynamic data generation patterns
└── seeders/          ← DB/API seed scripts for complex prerequisites
```

### 5. Add `.env` and `.auth/` to `.gitignore`

```
qa/07-automation/.env
qa/07-automation/.auth/
```

The `.env.example` file (committed) lists all required keys with `<PLACEHOLDER>` as the value.

---

## User Table Format (`04-test-data/users.md`)

```markdown
| Role | Env var (email) | Env var (password) | Permissions |
|---|---|---|---|
| Admin | QA_ADMIN_EMAIL | QA_ADMIN_PASSWORD | Full access |
| Read-only | QA_READONLY_EMAIL | QA_READONLY_PASSWORD | View only |
```

---

## Fixture Files (`04-test-data/fixtures/`)

Use Markdown tables or JSON for static reference data that tests depend on (catalogs, option lists, etc.).

```markdown
# fixtures/catalogs.md
## Labor Types
| Code | Name |
|---|---|
| LT-01 | Consulting |
| LT-02 | Development |
```

Reference fixtures in specs via `import` (JSON) or inline expectations matching the fixture values.

---

## Factory Pattern (`04-test-data/factories/`)

Document how to generate complex data shapes needed by multiple tests:

```typescript
// factories/supplier.ts
export function buildSupplier(idx: number) {
  return {
    name:  `Supplier-${idx}`,
    rut:   `${76_000_000 + idx}-0`,
    email: `supplier-${idx}@test.example`,
  };
}
```

---

## On test teardown

Do **not** delete test data after each run unless the test explicitly requires a clean state. Leftover data from old EXEC_IDX values does not affect subsequent runs because EXEC_IDX generates distinct names.

Exception: if the system enforces uniqueness on a field that EXEC_IDX cannot make unique (e.g., a singleton config), document the teardown strategy in `04-test-data/seeders/`.
