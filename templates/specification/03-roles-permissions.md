# Roles and Permissions — {{MODULE_NAME}}: {{SUBMODULE_NAME}}

> **Module code**: {{MODULE_CODE}} | **Submodule code**: {{SUBMODULE_CODE}}  
> **Last updated**: YYYY-MM-DD

---

## Access Matrix

| Feature / Action | {{Role 1}} | {{Role 2}} | {{Role 3}} | Notes |
|-----------------|-----------|-----------|-----------|-------|
| View list | ✅ | ✅ | ❌ | |
| View detail | ✅ | ✅ | ❌ | |
| Create new record | ✅ | ❌ | ❌ | |
| Edit record | ✅ | ❌ | ❌ | |
| Delete / deactivate | ✅ | ❌ | ❌ | Only own records |
| Approve / reject | ❌ | ✅ | ❌ | |
| Export | ✅ | ✅ | ❌ | |
| View audit log | ✅ | ❌ | ❌ | |

**Legend**: ✅ Permitted | ❌ Not permitted | ⚠️ Conditional

---

## Test User Reference

| Role | Env var (email) | Env var (password) | Notes |
|------|----------------|-------------------|-------|
| {{Role 1}} | `QA_USER_{{ROLE1_UPPER}}_EMAIL` | `QA_USER_{{ROLE1_UPPER}}_PASSWORD` | {{any notes}} |
| {{Role 2}} | `QA_USER_{{ROLE2_UPPER}}_EMAIL` | `QA_USER_{{ROLE2_UPPER}}_PASSWORD` | {{any notes}} |
| {{Role 3}} | `QA_USER_{{ROLE3_UPPER}}_EMAIL` | `QA_USER_{{ROLE3_UPPER}}_PASSWORD` | {{any notes}} |

> ⚠️ **Never put actual credentials in this file.** Credentials are loaded from environment variables only.

---

## Notes

- {{Conditional access rule 1, e.g., "Admin can only edit records created by their team"}}
- {{Conditional access rule 2}}
- {{Any role-specific UI differences, e.g., "Encargado sees additional 'Assign' button"}}

---

## Changelog

| Version | Date | Description |
|---------|------|-------------|
| 1.0 | YYYY-MM-DD | Initial creation |
