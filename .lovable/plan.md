# Fix the Heatmap toggle on `/rep/ruta`

## Problem

Toggling **Heatmap** on the Ruta del día map produces no visible change. The server function `getOpportunityHeatmapFn` returns weighted points correctly (churn + recency + 12m value per client), but `RouteMap.tsx` renders them as `google.maps.Circle` overlays with `fillOpacity: 0.25` and a single orange color. On the default light map style, under the green client markers, they blend into the terrain and are essentially invisible.

The doc `docs/panel-representantes.md` already states the intended implementation: `google.maps.visualization.HeatmapLayer` with the `visualization` library loaded — which produces the recognizable red/yellow/green density blobs users expect from a heatmap.

## Fix (frontend only, `src/components/rep/RouteMap.tsx`)

1. **Use the real HeatmapLayer.** Replace the `maps.Circle` loop in the heatmap branch (around lines 249–263) with a single `new maps.visualization.HeatmapLayer({ data, map, ... })`.
   - `data`: array of `{ location: new maps.LatLng(lat, lng), weight }` from `heatQ.data.points`, filtering out zero/near-zero weights so hot spots stand out.
   - Config: `radius: 40`, `opacity: 0.75`, `dissipating: true`, and a gradient going from transparent → green → yellow → orange → red so it reads as an opportunity heatmap rather than uniform orange.
   - Push the layer into `overlaysRef.current` and call `layer.setMap(null)` on cleanup (existing cleanup loop already calls `.setMap?.(null)` so this works as-is).

2. **Ensure the visualization library is loaded.** The Google Maps loader in `src/lib/google-maps-loader.ts` / the script tag needs `libraries=visualization` (the doc says it already does). If `maps.visualization` is undefined at runtime, fall back to the current circle rendering so the toggle never becomes a no-op — but with brighter styling (`fillOpacity: 0.55`, radius scaled to weight, red fill) instead of the current pale orange.

3. **Dim markers while heatmap is on.** When `showHeatmap && !routeMode`, render the client markers at reduced opacity (`opacity: 0.55`) so the heat blobs are the dominant visual. Toggle back to full opacity when heatmap is off.

4. **Add a small legend chip.** Next to the Heatmap button, when active, show a compact gradient legend (`Baja → Alta oportunidad`) so the user immediately understands what the color ramp means.

5. **Empty-state feedback.** If `heatQ.data?.points` is empty or every weight is 0 (new rep with no orders/insights yet), show a toast on toggle: "No hay suficientes datos de oportunidad todavía." Currently the button silently does nothing in that case, which is indistinguishable from the current bug.

## Out of scope

No server-side changes. `getOpportunityHeatmapFn` scoring stays as-is (churn 0.5 + recency + log10(total) capped at 0.4). If we later want to tune weights or filter by lab/zone, that's a separate task.

## Files touched

- `src/components/rep/RouteMap.tsx` — heatmap rendering, marker dimming, legend, empty-state toast.
- (Verify only) `src/lib/google-maps-loader.ts` and `src/routes/api/public/maps.script.ts` — confirm `libraries=visualization` is present; add it if missing.
