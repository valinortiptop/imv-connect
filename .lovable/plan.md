# Handy-inspired upgrade of the Rep module

Multi-phase plan across the four bundles you selected. Each phase is self-contained and ships value on its own; later phases depend on earlier ones only where noted.

Only rep-side UI + light server functions. Admin flows keep their existing screens.

---

## Phase 1 — Sales & money flows (highest ROI)

Reps close more of the sales cycle from the field.

1. **Cotizaciones desde `/rep`** — new route `rep.cotizaciones.tsx` (list) + `rep.cotizaciones.$id.tsx` (builder). Reuses `quotes` / `quote_items`. From the client 360 add "Nueva cotización". Convert-to-pedido button copies items into `pedidos`.
2. **Cobranza en ruta** — new `rep.cobranza.tsx` and a "Registrar pago" action on client 360. Reads open `facturas` for the client, writes `pagos` with method (efectivo/transferencia/cheque) and optional foto de comprobante (Supabase Storage).
3. **Devoluciones desde ruta** — "Iniciar devolución" from client screen creates a `devoluciones` draft with `devolucion_items`, motivo, foto evidence, geo stamp. Admin reviews as today.
4. **Promos aplicadas al pedido** — pedido builder queries `product_promotions` active for the client's price list + date, auto-applies matching rules, shows a "Promociones aplicadas" chip. No schema change if promotions table already covers rules; otherwise add `applied_promotions jsonb` on `pedido_items`.

Server functions (all `.middleware([requireSupabaseAuth])`):
`src/lib/rep-sales.functions.ts` — `listRepQuotes`, `saveQuote`, `convertQuoteToPedido`, `registerPayment`, `startDevolucion`, `getActivePromosForClient`.

---

## Phase 2 — Visit quality & evidence

Make every visit auditable and richer.

5. **Anti-fraude GPS + foto en check-in** — extend `rep_visits` write path: require current geolocation, compute distance to `clientes.lat/lng`, block > configurable radius (default 300m) unless "override + motivo". Require at least one photo. Store `distance_m`, `override_reason`, `photos jsonb[]`.
6. **Foto de anaquel / share-of-shelf** — new table `visit_shelf_photos (id, visit_id, category, photo_url, notes, created_at)`. UI on visit screen with category tags (anaquel principal, exhibición, competencia, precio). Timeline view per client shows previous photos side by side.
7. **Formularios dinámicos por visita** — new tables `visit_form_templates (id, name, fields jsonb, active)` and `visit_form_responses (id, visit_id, template_id, answers jsonb)`. Admin defines templates (short: text/number/select/photo/rating fields). Rep sees applicable forms during check-in.
8. **Prospectación en campo** — new `rep.prospectos.tsx` and floating "Nuevo prospecto" button on `/rep/ruta`. One screen captures name, phone, address (autocomplete via Valinor Maps proxy), current lat/lng, foto, first `prospect_calls` note.

Migrations:
- add `distance_m numeric`, `override_reason text`, `photos jsonb default '[]'` to `rep_visits` (already 16 cols — verify)
- create `visit_shelf_photos`, `visit_form_templates`, `visit_form_responses` with grants + RLS (owner-scoped for reps, admin sees all)
- Supabase Storage bucket `rep-evidence` (private, signed URLs)

---

## Phase 3 — Performance & reporting

Give reps and supervisors clarity on numbers and health.

9. **Metas y mínimo de venta** — new table `rep_targets (rep_id, period_month, target_amount, min_daily, target_by_lab jsonb)`. `/rep` home shows today vs. mínimo, month vs. meta, per-laboratorio progress bars. Server fn aggregates from `pedidos`.
10. **Cierre de día automático** — new `rep.cierre.tsx` (also a scheduled push at 6pm). Summarizes: visitas realizadas, pedidos $, cobros $, devoluciones, km recorridos (from `rep_visits` geo trail), tiempo promedio por cliente, top clientes del día. Export PDF.
11. **Reportes filtrables + export CSV** — extend `rep.supervisor.tsx` with filters (fecha desde/hasta, representante, zona, tipo de evento, laboratorio) and a "Exportar CSV/Excel" button. Uses `sheetjs` or streaming CSV response.
12. **Push notifications operativas** — Web Push via VAPID (server-generated keypair, stored as secrets). New table `push_subscriptions (user_id, endpoint, p256dh, auth)`. Trigger points: pedido aprobado, meta diaria alcanzada, entrega saliendo del CEDIS, prospecto asignado. Rep sidebar shows a "Activar notificaciones" toggle.

Migration for `rep_targets`, `push_subscriptions`. Cierre de día uses a server function + optional `pg_cron` job posting to `/api/public/cron/rep-eod`.

---

## Phase 4 — Field tooling & offline

Reduce friction in the day-to-day.

13. **PDF/ticket sharing** — server functions render pedido/cotización/cobro/entrega as PDF (using `@react-pdf/renderer` on the server since it's Worker-friendly, or an HTML→PDF via Valinor proxy if one exists). "Compartir por WhatsApp" opens `wa.me` with a signed URL. Layout tuned for 80mm thermal so users can also print via the phone's native share.
14. **Catálogo enriquecido para mostrar al cliente** — `rep.catalogo.tsx`: image-first grid over `productos` filtered by the client's price list, with stock chip, promo badges, and "Agregar a pedido en curso". Kiosk-friendly zoom for showing the phone to the client.
15. **Modo offline en captura de pedidos** — biggest effort. IndexedDB queue (`idb` package) for draft pedidos + read cache of catálogo/clientes. Service worker (Workbox) with runtime caching for `/rep/*` shell. On reconnect, background sync flushes drafts through the existing pedido server fn with idempotency key. UI shows "3 pedidos pendientes de sincronizar" banner. Ship only after Phases 1–3 land so we're not moving targets.

---

## Cross-cutting: AI hooks

Every new page gets an `<AIPageInsights module="…" />` block, and `src/lib/ai/rep-ai.server.ts` learns three new context builders:
- `rep-cotizaciones` (suggest cross-sell items, price positioning)
- `rep-cobranza` (rank clients by overdue risk, suggest scripts)
- `rep-cierre` (narrative summary + tomorrow's priorities)

---

## Delivery order & rough sizing

```text
Phase 1  Sales & money flows        ~M  (2 routes, 1 fn file, 0-1 migration)
Phase 2  Visit quality & evidence   ~L  (3 migrations, storage bucket, 1 route)
Phase 3  Performance & reporting    ~L  (2 migrations, VAPID + push worker, PDF cierre)
Phase 4  Field tooling & offline    ~XL (PDF renderer, service worker, IndexedDB sync)
```

Each phase is a separate build turn. Confirm and I'll start with Phase 1.

## Technical notes

- All new server fns use `requireSupabaseAuth` and go under `src/lib/`.
- Every new public table gets `GRANT ... TO authenticated`, `GRANT ALL TO service_role`, RLS enabled, and policies scoped via `has_role` for admin and `auth.uid()` for rep owner.
- Evidence photos in a private Storage bucket, served through signed URLs from a server fn.
- Push uses `web-push` compatible ESM lib that runs on the Worker runtime; VAPID keys stored via `generate_secret`.
- PDFs render server-side; keep libs Worker-compatible (`@react-pdf/renderer` works; avoid `puppeteer`/`sharp`).
- No changes to admin routes — only additive.
