# Google address lookups: what's left to trim

## What the data shows
- The dashboard shows about 1,425 Google address lookups. The app's saved-address list has 3,289 addresses. About 1,866 of them were copied from coordinates we already had, which didn't cost anything. The other roughly 1,423 were new Google lookups made between Nov 9 and Nov 12, during the one-time "locate pending addresses" fill-in and the client imports. That matches the dashboard almost exactly.
- No new addresses have been saved since Nov 12, so day-to-day use (lists, maps, visits) is reading saved locations, not asking Google again.
- One leftover gets past the saved list: the **Estado de APIs** page asks Google to look up "Mexico" every time it opens or refreshes. It also runs paid test calls to every other service (AI, email, search).
- That test can also be started by someone who isn't signed in, so anyone who finds it could keep spending money.

## Changes
1. **Lock the API status check to admins.** Only a signed-in admin can run it.
2. **No automatic test calls.** The Estado de APIs page shows the last result and only runs the test when the admin clicks "Probar ahora". It no longer reruns when you come back to the tab.
3. **A cheaper Google test.** The test looks up one saved address through the saved list instead of a fresh Google lookup, so it stops counting as a paid lookup.
4. **Warn if saving a found address fails.** Right now a failed save is only logged quietly, so the same address could be paid for again without anyone noticing. Show it as a warning in the backfill summary.

## Not changing
- Check-in distance checks use the phone's GPS and the saved client locations, with no Google lookups.
- Route directions and the map script are separate Google services, outside this change.

## Technical details
- `pingProvidersFn` (src/lib/valinor.functions.ts): add `requireSupabaseAuth` plus a `has_role(admin)` check.
- `admin.estado-apis.tsx`: `enabled:false`, `refetchOnWindowFocus:false`, trigger with `refetch` on click.
- `pingProviders` Google check: call `geocodeWithCache` with a fixed query that is already saved.
- `geocodeWithCache`: return a `cacheWriteFailed` flag, count it in `geocodeBackfillFn`, and show it in GeocodeBackfillCard.
- Add a test: when the address is already saved, the Google test makes no Google call.
