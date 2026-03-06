# Business Rules — {{MODULE_NAME}}: {{SUBMODULE_NAME}}

> **Module code**: {{MODULE_CODE}} | **Submodule code**: {{SUBMODULE_CODE}}  
> **Last updated**: YYYY-MM-DD

---

## Summary

| ID | Title | Type | Trigger |
|----|-------|------|---------|
| RN-{{M}}-001 | {{rule title}} | Validation | {{trigger}} |
| RN-{{M}}-002 | {{rule title}} | Access Control | {{trigger}} |
| RN-{{M}}-003 | {{rule title}} | State Machine | {{trigger}} |

---

## Rules

### RN-{{MODULE_CODE}}-001: {{Rule Title}}

- **Type**: Validation
- **Trigger**: When user attempts to {{action}}
- **Behavior**: {{what the system does}}
- **Error message**: "{{exact text shown in UI}}"
- **Notes**: {{any special circumstances}}

---

### RN-{{MODULE_CODE}}-002: {{Rule Title}}

- **Type**: Access Control
- **Trigger**: When user with role {{role}} navigates to {{URL}}
- **Behavior**: {{redirect / error / empty page}}
- **Notes**: —

---

### RN-{{MODULE_CODE}}-003: {{Rule Title}}

- **Type**: State Machine
- **Trigger**: When {{action}} is performed on a record with status {{STATUS_A}}
- **Behavior**: Record transitions from {{STATUS_A}} to {{STATUS_B}}
- **Invalid state**: Attempting this action on status {{STATUS_C}} results in {{error}}
- **Notes**: —

---

### RN-{{MODULE_CODE}}-004: {{Rule Title}}

- **Type**: Calculation
- **Trigger**: When {{field}} or {{field}} changes
- **Behavior**: {{calculated_field}} = {{formula}}
- **Notes**: —

---

### RN-{{MODULE_CODE}}-005: {{Rule Title}}

- **Type**: Integration
- **Trigger**: When {{action}} completes successfully
- **Behavior**: {{external system}} is notified/called — {{what happens}}
- **Fallback**: {{what happens if external system fails}}
- **Notes**: —

---

## State Machine (if applicable)

```
{{STATUS_INITIAL}}
    │
    ├─[action: approve]──► {{STATUS_APPROVED}}
    │
    └─[action: reject]───► {{STATUS_REJECTED}}
```

| State | Code | Description |
|-------|------|-------------|
| {{Pending}} | {{1}} | {{description}} |
| {{Approved}} | {{2}} | {{description}} |
| {{Rejected}} | {{3}} | {{description}} |

---

## Changelog

| Version | Date | Description |
|---------|------|-------------|
| 1.0 | YYYY-MM-DD | Initial creation |
