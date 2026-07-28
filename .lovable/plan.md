## Goal

A full notifications system: a bell in the admin header, a dedicated Notifications Center page with filters by type/category/user, and a per-user preferences page with toggles for three channels — system (in-app), email (Resend via the Valinor proxy) and SMS (built but disabled/pending).

## Current state (verified)

- `public.notifications` exists with: `id, type, category, priority, title, description, route, user_id, read_at, created_at`.
- A bell already exists but only in the rep panel (`src/components/rep/NotificationBell.tsx`), with realtime insert/update subscription and "mark all read".
- The admin header (`src/routes/admin.tsx`) has no bell.
- Notifications are written today from `rep.functions.ts`, `rep-behavior.functions.ts`, `cobranza-fase5.functions.ts` (direct inserts).
- Email already goes through the Valinor proxy (`sendEmail` in `valinor-proxy.server.ts`, provider `resend`) — no new API key needed.

## Database (one migration)

1. Extend `notifications` with `channel_status jsonb default '{}'`, `entity_id text`, `emailed_at timestamptz`, plus indexes on `(user_id, read_at)` and `(category)`.
2. New `notification_preferences` table: `user_id`, `category`, `in_app boolean default true`, `email boolean default false`, `sms boolean default false`, timestamps, unique `(user_id, category)`. GRANTs for `authenticated` + `service_role`, RLS so a user only reads/writes their own rows; admins can read all.
3. New `notification_deliveries` table (audit of email/SMS sends: notification_id, channel, status, error, sent_at) with the same grant/RLS pattern.
4. Verify/patch `notifications` RLS so each user only sees rows where `user_id = auth.uid()` (admins may read all for the center's "by user" view).

## Backend

- `src/lib/notifications.functions.ts` (thin wrapper; helpers in `notifications.server.ts`):
  - `listNotificationsFn` — filters: category, type, priority, read/unread, date range, and `userId` for admins.
  - `markReadFn` / `markAllReadFn` / `deleteNotificationFn`.
  - `getMyNotificationPreferencesFn` / `saveNotificationPreferencesFn`.
  - `createNotificationFn` — central dispatcher: inserts the in-app row when the recipient's preference allows, and if `email` is enabled sends via the existing Valinor `sendEmail` helper (Resend), logging the result in `notification_deliveries`. SMS branch is stubbed: preference toggle exists but is rendered disabled ("Próximamente") and the dispatcher records `status = 'pending'` without sending.
- Existing direct `.from("notifications").insert(...)` call sites are switched to the dispatcher so preferences are respected.

## Frontend

- **Header bell** — promote the rep bell to `src/components/notifications/NotificationBell.tsx` (shared), keep realtime + unread badge, add a "Ver todas" footer link; mount it in the `admin.tsx` header (top right) and reuse it in `RepLayout`.
- **Notifications Center** — new route `/admin/notificaciones`:
  - KPI strip (unread, today, by priority).
  - Tabs by category (Cobranza, Compras, Almacén, Ventas, Rutas, Sistema) plus "Todas".
  - Filter bar: type, priority, read state, date range, and a user selector (admins only; regular users see just their own).
  - List with read/unread styling, route deep-links, mark-read and bulk actions, pagination (100/page).
- **Preferences page** — new route `/admin/configuracion/notificaciones` (also linked from Administración): a table of categories × channels with switches for System / Email / SMS (SMS disabled), a master toggle per channel, and Guardar.
- Sidebar entries added under the existing general/configuration group and registered in `permission_routes` so role permissions apply.

## Technical notes

- Email content: simple branded HTML template built server-side, sent with `sendEmail({ provider resend via Valinor })`; sender address taken from existing config used elsewhere in the app.
- Realtime subscription stays inside `useEffect` with `removeChannel` cleanup.
- No Lovable AI/email tooling used — everything routes through the Valinor proxy per project convention.
