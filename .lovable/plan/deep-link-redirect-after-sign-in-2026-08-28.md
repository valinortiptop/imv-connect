# Deep-link redirect after sign-in

## Problem
When a signed-out user opens a direct link (e.g. `https://app.imv.lat/rep/supervisor`), the auth guards bounce them to `/login`, and the login page always sends them to `/admin` or `/rep` — the original destination is lost.

## Changes

1. **Preserve the intended path in the auth guards**
   - `src/routes/rep.tsx` and `src/routes/admin.tsx` `beforeLoad`: when no user, redirect to `/login?redirect=<current pathname>` (using the location TanStack Router passes to `beforeLoad`).
   - `src/routes/rep.supervisor.tsx`: when unauthenticated, redirect straight to `/login?redirect=/rep/supervisor` instead of `/rep` (which currently loses the target). The non-admin check still redirects to `/rep` as before.

2. **Login page honors the redirect**
   - `src/routes/login.tsx`: add `validateSearch` for an optional `redirect` string.
   - After successful password sign-in, and in the "already signed in" check on mount, navigate to the sanitized `redirect` path when present; otherwise keep the current rep/admin logic.
   - Sanitization: only allow paths starting with `/` but not `//` (blocks external URLs), and never back to `/login` itself.

3. **OAuth safety**: Google sign-in (use-auth `signInWithGoogle`) redirects to `window.location.origin` — out of scope here since the reported flow is password sign-in on `/login`, but the sanitize helper will be shared so it can be reused later.

## Verification
- Signed out, open `/rep/supervisor` → lands on `/login?redirect=%2Frep%2Fsupervisor` → sign in → arrives at `/rep/supervisor` (admin) instead of `/admin`.
- Sign in without a redirect param still goes to `/admin` (or `/rep` for rep-only users) as today.
- A malicious `?redirect=https://evil.com` is ignored and falls back to the default destination.
