# Nuevo hub "Salida de NetSuite" (onboarding desde cero)

Se borra todo el contenido actual de `/admin/onboarding` y se reconstruye como un centro de mando moderno, con diseño propio (puede romper el estilo del resto de la app). Tres áreas principales, pensado para que Doris suba y encuentre todo sin esfuerzo.

## Estructura de la página

```text
+------------------------------------------------------------------+
| Hero: "Salida de NetSuite"  · cuenta regresiva a fecha de corte  |
| Anillo de avance  | Docs 4/17 | Sesiones 2/9 | Tareas abiertas 6 |
+------------------------------------------------------------------+
| [ Documentos ]  [ Sesiones y agenda ]  [ Tareas y bugs ]         |
+------------------------------------------------------------------+
```

### 1. Documentos (bucket de archivos, no llena nada en el sistema)
- Zona de arrastre gigante en toda la pestaña: soltar archivos en cualquier parte; también botón "Subir" y subir varios a la vez con barra de progreso.
- Lista de documentos requeridos del plan agrupada por área (Comercial, Cobranza, Almacén/Compras, Contabilidad, Fiscal), cada uno como tarjeta con estado visible: Falta / Subido / Revisado por IA (OK o con observaciones) / Validado.
- Arrastrar un archivo directo sobre la tarjeta de un documento lo asigna a ese requisito; si se suelta en la zona general, la IA sugiere a cuál corresponde.
- Al subir, la IA (vía proxy Valinor) revisa el archivo contra lo que se pidió: ¿es el documento correcto?, ¿está completo?, ¿faltan columnas/fechas? Muestra un veredicto (Bien / Revisar / Incorrecto) con 2–3 observaciones cortas.
- Vista previa limpia en panel lateral: PDF e imágenes en línea, Excel/CSV como tabla de las primeras filas, con descarga, reemplazar versión e historial de versiones.
- Marcadores: estrella "importante", "necesita atención" y validación manual (admin/contabilidad).
- Filtros: todos, faltantes, con observaciones, validados; búsqueda por nombre.
- Los archivos no alimentan clientes, productos ni nada más: solo se guardan.

### 2. Sesiones y agenda
- Lista de las 9 sesiones del plan (con Maresi, contador, almacén, etc.): objetivo, duración, roles requeridos, asistentes y estado (por agendar / agendada / realizada).
- Asistentes: agregar personas por sesión (nombre, rol, correo), marcar asistencia después.
- **Agenda pintando horas** (traída de Valinor Studio): cuadrícula de días × bloques de 30 min donde cada persona pinta con el mouse/dedo las horas en que está libre. Se ve el mapa de calor con quién coincide, y el sistema propone el mejor horario por sesión según los roles requeridos (respeta descansos y máximo de horas por día, hora de CDMX).
- Confirmar horario propuesto con un clic, descargar invitación de calendario (.ics) y seguir sincronizando con Valinor Studio por la conexión que ya existe.
- Notas y acuerdos por sesión.

### 3. Tareas y bugs
- Tablero tipo kanban (Pendiente / En curso / En revisión / Hecho) con filtro Tarea vs Bug.
- Cada tarjeta: título, descripción, módulo, prioridad, responsable, fecha, captura de pantalla adjunta, ligada opcionalmente a una sesión.
- Captura rápida: botón "Reportar bug" con pegar imagen (Ctrl+V).
- Se precargan las tareas de desarrollo del plan actual.

## Lo que se conserva y lo que se borra
- Se borra: la página actual, el lector IA viejo, fases/tarjetas por área, pestañas Responsables y Paralelo en esta vista.
- Se conserva en la base: fecha de corte, decisión NetSuite y sesiones (para no romper la sincronización con Valinor Studio). Los documentos viejos se migran a la nueva lista de requisitos si coinciden; si no, quedan como "Otros".

## Detalles técnicos
- Tablas nuevas: `launch_doc_requirements` (catálogo del plan), `launch_documents` (archivo, versión, requisito, estado IA, veredicto, marcadores), `launch_session_attendees`, `launch_availability` (persona, rol, slots[]), `launch_tasks` (tipo tarea/bug, estado, prioridad, módulo, responsable, adjuntos). Todas con GRANT + RLS vía `is_staff`; validar/borrar solo admin/contabilidad.
- Bucket privado `launch-documents`, URLs firmadas para vista previa.
- Revisión IA en un server function: Gemini `valinor:vision` vía `callValinor` (PDF/imagen en base64; Excel/CSV se parsea a texto con `xlsx` antes de enviar). Resultado guardado en la fila; errores visibles sin inventar veredicto.
- Portar `availability.ts` de Valinor Studio (bestSlots, planSessions, icsFor) a `src/lib/availability.ts` con sus pruebas, y el componente de cuadrícula con pintado por pointer events (accesible por teclado).
- Ruta `/api/public/valinor-launch-sync` se adapta a las nuevas tablas manteniendo la misma respuesta.
- Diseño: tokens nuevos scoped a la página (no se cambian los globales), animaciones con respeto a reduced-motion, responsive desde 320px.
- Actualizar `AGENTS.md` (regla de onboarding).

## Preguntas abiertas (asumo lo indicado si no hay respuesta)
- La agenda la pintan solo usuarios con cuenta en la app (asumido) o también externos con liga pública.
- Doris tiene permiso de validar documentos (asumido: no, solo subir; validan admin/contabilidad).
