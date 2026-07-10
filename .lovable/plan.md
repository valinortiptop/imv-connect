## Two fixes: auto-updating build marker + verify mobile catálogo dialog

### 1. Build marker auto-updates on every publish

Today `src/components/admin-sidebar.tsx` hardcodes:

```ts
const ADMIN_BUILD_MARKER = "Build 2026.07.09-2";
```

That literal only changes when I edit it by hand, so publishing a new deploy doesn't move it. Fix by injecting the build timestamp at build time via Vite `define`.

**Changes:**

- `vite.config.ts` — pass a `define` through `@lovable.dev/vite-tanstack-config`:
  ```ts
  export default defineConfig({
    tanstackStart: { server: { entry: "server" } },
    vite: {
      define: {
        __BUILD_ID__: JSON.stringify(
          new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC"
        ),
      },
    },
  });
  ```
  (If the wrapper doesn't forward `vite.define`, fall back to setting it via a small custom plugin inside the same config; verified before writing.)

- `src/vite-env.d.ts` (or a new `src/types/build.d.ts`) — declare `declare const __BUILD_ID__: string;` so TS accepts it.

- `src/components/admin-sidebar.tsx` — replace the constant:
  ```ts
  const ADMIN_BUILD_MARKER = `Build ${__BUILD_ID__}`;
  ```

Every publish reruns Vite, so `__BUILD_ID__` becomes the fresh deploy timestamp. Combined with the existing `useBuildVersionCheck` hook, open tabs will reload and show the new marker.

### 2. Mobile catálogo "Bultos disponibles" dialog

The `AvailabilityDownloadDialog.tsx` fix from last turn IS in the file (mobile card layout, responsive dialog shell, stacked footer). If it still looks broken in the user's mobile preview, it's a stale cache — the `useBuildVersionCheck` hook should have reloaded, but a fresh publish (which fix #1 above will trigger anyway) plus a hard refresh confirms.

**Verification steps after both changes:**

1. `bunx tsgo --noEmit`.
2. Publish, then load `/admin/catalogo` on 390×844 mobile: click **Disponibilidad** → dialog fills the viewport with padding, product rows render as stacked cards, no floating "BULTOS DISPONIBLES" fragment.
3. Confirm the sidebar footer shows a build marker matching the new deploy time, and that publishing again changes it.

### Out of scope

- No changes to catálogo page logic, queries, or PNG export.
- No new UI beyond swapping the hardcoded build string.
