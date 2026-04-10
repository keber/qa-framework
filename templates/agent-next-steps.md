# AGENT-NEXT-STEPS — {PROJECT_NAME}

> **Sprint activo: Sprint {N} — {SPRINT_NAME}**
> Lee este archivo primero. Lee los archivos referenciados solo cuando la tarea lo requiera.

---

## Estado del módulo

| Módulo / Submódulo | Specs | Plan | Auto | Estado |
|---|---|---|---|---|
| {MODULE_NAME} / {SUBMODULE_NAME} | ✅ | ✅ | ⬜ | Sprint {N} activo |

> Actualizar esta tabla cuando un sprint se complete. Historial de sprints completados → `qa/README.md ## Sprint History`.

---

## Sprint {N} — Tareas pendientes

- [ ] {Tarea 1}
- [ ] {Tarea 2}
- [ ] {Tarea 3}
- [ ] Actualizar `qa/README.md` (fila del módulo + Sprint History)
- [ ] Trim este archivo: dejar solo el sprint siguiente

**Precondiciones**: {Dependencias de datos o módulos previos, si aplica}

**Notas específicas**: {Quirks del DOM, rutas, selectores problemáticos conocidos — o eliminar esta línea}
→ Si las notas son extensas, guardarlas en `qa/memory/{sprint-name}-discovery.md` y referenciar aquí.

---

## Contexto obligatorio antes de codificar

- Patrones del proyecto: `qa/memory/INDEX.md` → cargar solo los archivos relevantes
- Referencia de estilo: `qa/07-automation/e2e/tests/{module}/` (leer suite existente más reciente)

---

## Sprints siguientes (solo referencia — sin checklists)

- **Sprint {N+1}**: {Descripción breve — qué módulo/submódulo}
- **Sprint {N+2}**: {Descripción breve}

---

<!-- ═══════════════════════════════════════════════════════════════════
  REGLAS DE MANTENIMIENTO DE ESTE ARCHIVO (para el agente)
  ——————————————————————————————————————————————————————————————————
  1. MÁXIMO UN SPRINT ACTIVO. Cuando un sprint se completa:
       a. Mover su checklist al README.md bajo ## Sprint History
       b. Borrar esa sección de este archivo
       c. Promover el siguiente sprint a "activo"
  2. NO repetir instrucciones permanentes que ya estén en copilot-instructions.md.
  3. Los detalles técnicos (DOM, patrones) van en qa/memory/, no aquí.
  4. Los sprints "siguientes" son bullets de 1 línea, sin checklists.
  Este archivo es una cola de trabajo. No es un log ni una bitácora.
  ══════════════════════════════════════════════════════════════════ -->
