# Plan de Pruebas — {{PROYECTO}} — Sprint {{NNN}} — {{MODULO_NOMBRE}}

**Proyecto:** {{PROYECTO}}
**Sprint:** {{NNN}}
**Módulo:** {{MODULO_NOMBRE}}
**Código módulo:** {{MODULO_CODE}}
**Fecha planificación:** {{YYYY-MM-DD}}
**Ventana QA:** {{YYYY-MM-DD}} y {{YYYY-MM-DD}}
**ADO Test Plan:** [Plan {{ADO_PLAN_ID}} — {{PROYECTO}} Sprint {{NNN}}]({{ADO_TEST_PLAN_URL}}) *(omitir si ADO no está habilitado)*

---

## 1. Objetivo

> Definir la estrategia de pruebas para el Sprint {{NNN}}, orientada a:
> - Confirmar la correcta implementación de las tareas comprometidas en el sprint.
> - Cubrir los flujos críticos del módulo **{{MODULO_NOMBRE}}**.
> - Identificar riesgos funcionales, de datos y de integración.

---

## 2. Alcance

### En alcance
- {{FUNCIONALIDAD_1}}
- {{FUNCIONALIDAD_2}}

### Fuera de alcance
- {{EXCLUSION_1}} *(motivo: {{RAZON}})*
- {{EXCLUSION_2}}

---

## 3. Items del Sprint (normalizados)

> Listar las tareas/historias ADO incluidas en este sprint, agrupadas por área funcional.
> Si no hay ADO, listar los requerimientos o módulos abordados.

### {{AREA_FUNCIONAL_1}}
- Task {{ID}} — {{DESCRIPCION}}
- Task {{ID}} — {{DESCRIPCION}}

### {{AREA_FUNCIONAL_2}}
- Task {{ID}} — {{DESCRIPCION}}

---

## 4. Priorización

**P0 – Confirmación (obligatorio)**
- {{ESCENARIO_CRITICO_1}}
- {{ESCENARIO_CRITICO_2}}

**P1 – Smoke (camino feliz)**
- {{FLUJO_PRINCIPAL}}

**P2 – Regresión mínima adyacente**
- {{REGRESION_1}}

**P3 – Exploratoria (timeboxed)**
- Charter 1 ({{N}} min): {{DESCRIPCION_CHARTER}}

---

## 5. TestSuites (agrupación para ADO)

> Cada suite se crea como un Test Suite dentro del Test Plan ADO.
> Si ADO no está habilitado, usar como agrupación lógica de la tabla de pruebas.

1. **{{SUITE_1}}**
2. **{{SUITE_2}}**
3. **{{SUITE_3}}**

---

## 6. Precondiciones generales

- Ambiente QA disponible en `{{QA_BASE_URL}}`
- Roles disponibles:
  - Usuario **{{ROL_1}}** — para {{ACCION}}
  - Usuario **{{ROL_2}}** — para {{ACCION}}
- Datos base:
  - {{DATO_BASE_1}}
  - {{DATO_BASE_2}}

---

## 7. Datos mínimos sugeridos

| Item | Valor / Referencia |
|------|--------------------|
| {{DATO_1}} | `process.env.{{ENV_VAR}}` |
| {{DATO_2}} | {{VALOR_O_PATRON}} |

---

## 8. Supuestos & Faltantes críticos

**Supuestos:**
- **Supuesto:** {{SUPUESTO_1}}

**Faltantes críticos (TODO antes de ejecutar):**
1. **TODO:** {{PENDIENTE_1}}
2. **TODO:** {{PENDIENTE_2}}

---

## 9. Tabla de Pruebas

> Convenciones:
> - **TC-ID:** `TC-{{MODULO_CODE}}-{{SUBMODULO_CODE}}-NNN` (o `N/A` si no hay ID asignado aún)
> - **Steps:** numerados, separados por `<br>` — verbos concretos de UI (`Navegar a`, `Ingresar`, `Hacer click`, `Verificar`)
> - **Confirma:** `Task NNNNN` si hay tarea ADO relacionada; `N/A` si no aplica
> - **Tipo:** `Manual` | `Automatizado` | `Ambos`
> - **Prioridad:** `P0` | `P1` | `P2` | `P3`

| N | TC-ID | Suite / Área Funcional | Título | Descripción | Steps | Resultado Esperado | Confirma | Tipo | Prioridad |
|---|-------|------------------------|--------|-------------|-------|--------------------|----------|------|-----------|
| 1 | TC-{{MODULO_CODE}}-{{SUB}}-001 | {{SUITE_1}} | [{{ETIQUETA}}][{{P}}] {{TITULO}} | {{DESCRIPCION}} | 1) {{PASO_1}}<br>2) {{PASO_2}}<br>3) {{PASO_3}} | {{RESULTADO_ESPERADO}} | Task {{ID}} | Manual | P0 |
| 2 | TC-{{MODULO_CODE}}-{{SUB}}-002 | {{SUITE_1}} | [{{ETIQUETA}}][{{P}}] {{TITULO}} | {{DESCRIPCION}} | 1) {{PASO_1}}<br>2) {{PASO_2}} | {{RESULTADO_ESPERADO}} | N/A | Automatizado | P1 |

> **Etiquetas de título:** `[CONFIRMACION]` | `[SMOKE]` | `[REGRESION]` | `[EXPLORATORIA]`

---

## 10. Matriz de Trazabilidad

| Task ADO | N casos (tabla) |
|----------|-----------------|
| Task {{ID}} | 1, 3, 5 |
| Task {{ID}} | 2, 4 |

> Si no hay Tasks ADO, usar esta sección para mapear requerimientos o funcionalidades a N.

---

## 11. Notas de automatización

> Para los TCs marcados como `Automatizado` o `Ambos`, el spec file de referencia es:
> `qa/07-automation/e2e/tests/{{modulo-kebab}}/{{submodulo-kebab}}.spec.ts`
>
> Los steps de esta tabla son la fuente autoritativa para los `test.step()` en el spec.

---

## Consolidado de sprint

> Si este sprint cubre múltiples módulos, existe un documento consolidado generado automáticamente:
> `qa/02-test-plans/sprints/Sprint-{{NNN}}/Plan-de-Pruebas-{{PROYECTO}}-Sprint-{{NNN}}.md`
>
> El consolidado se genera con el script `@keber/ado-qa consolidate-sprint --sprint {{NNN}}`.
> **No editar manualmente** — es derivado de los archivos por módulo.
