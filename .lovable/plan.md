## Diagnóstico actual

Hice un escaneo de todo `src/` y encontré que **las únicas importaciones rotas en el proyecto son**:

```
src/components/ui/animated-ai-chat.tsx
  → @/components/ui/liquid-metal-button   (no existe)
  → @/components/ui/liquid-metal-border   (no existe)
  → @/components/ui/grid-animation        (no existe)

src/components/centrales-page.tsx
src/components/CentralEditDrawer.tsx
  → @/integrations/supabase/types         (no existe — solo afecta a Centrales, que no está en el sidebar)
```

**Eso explica Gandalf** (`/admin/gandalf`): la consola muestra `Failed to fetch dynamically imported module: admin.gandalf.tsx` porque `animated-ai-chat.tsx` no resuelve sus imports → toda la ruta falla.

**Calculadora** (`/admin/calculadora`) **no tiene imports rotos**. Si aparece en blanco probablemente es por un error de runtime, datos vacíos de Supabase, o un componente interno que falla silenciosamente — hay que abrirla y revisar consola en vivo.

Todas las demás 30+ rutas del sidebar resuelven imports correctamente (HTTP 200 desde el dev server). Eso no garantiza que rendericen contenido útil — solo que no fallan al cargar el módulo.

## Plan

### Fase 1 — Arreglar Gandalf (root cause conocido)
Crear los 3 componentes UI faltantes como wrappers ligeros compatibles con el API que usa `animated-ai-chat.tsx`:
- `src/components/ui/liquid-metal-button.tsx` — botón con borde animado/gradiente.
- `src/components/ui/liquid-metal-border.tsx` — wrapper con borde animado.
- `src/components/ui/grid-animation.tsx` — fondo animado tipo grid (puede reusar `animated-grid-pattern` que ya existe).

Verificar: navegar a `/admin/gandalf`, confirmar que ya no hay error de import y que renderiza el chat.

### Fase 2 — Auditoría sistemática del sidebar
Recorrer cada item del sidebar en orden, en grupos:

```
General:      Dashboard, Gandalf, Tareas, Calculadora
Ventas:       Prospectos, Pedidos, Clientes, Vendedores, Facturación, Promociones,
              Partners, Listas de Precios, Sales, P&L, Ventas
Inventario:   Productos, Inventario, Almacén, Kardex, Entradas,
              Necesidades de Compra, Devoluciones, Dañados
Operaciones:  Logística, Maniobra, Catálogo, Documentos
Configuración: Portal Clientes, Admin
```

Para cada uno:
1. Navegar a la ruta en el preview.
2. Capturar console errors y network failures.
3. Clasificar el estado: ✅ funciona / ⚠️ renderiza pero le falta data o feature / ❌ roto.
4. Para los rotos: arreglar import faltante, componente faltante, o señalar que requiere edge function / RPC inexistente.
5. Para los incompletos: comparar contra lo que llama la página (RPCs, tablas, edge functions) y decir explícitamente qué falta del backend.

### Fase 3 — Reportar y priorizar
Entregar una tabla con el estado real de cada página y cuál es el siguiente paso por cada una (frontend fix vs backend / RPC / edge function pendiente).

## Preguntas para confirmar antes de implementar

1. **¿Quieres que arregle TODO en un solo loop**, o prefieres que vaya página por página confirmando contigo después de cada grupo (General → Ventas → Inventario → …)?
2. **Para Calculadora y Gandalf**, ¿el comportamiento esperado del "reference repo" requiere edge functions (`ai-chat`, etc.) que aún no existen en este proyecto? Si sí, las dejo con un mensaje claro de "función no disponible" o las stubbeo con datos de ejemplo.
3. Las páginas que dependen de **RPCs / tablas / edge functions** que no existen en este proyecto (la mayoría de la lógica del reference repo), ¿quieres que las **stubee con UI vacía + toast informativo**, o que cree las migraciones SQL para que funcionen end-to-end? (esto último es trabajo significativo por página).
