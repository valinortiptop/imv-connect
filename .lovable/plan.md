## Goal
In "Nueva remisión", the lot dropdown currently crams lot number + expiry + available qty into one option label, which truncates. Show only the lot number in the dropdown, and display the stock in a separate field next to it.

## Changes (src/components/almacen/NuevaRemisionDialog.tsx)

1. Lot `<select>` options: render only `b.lote ?? "sin lote"` (drop the `· cad … · … disp.` suffix). Keep "Lote…" placeholder and "Otro lote (manual)…" option.
2. Add a new read-only "Existencia" field immediately to the right of the lot select, showing the available quantity of the selected lot (from the existing `selectedStock(l)` helper), or `—` when no lot is selected. Styled as a disabled/muted input so it reads as informational.
3. Adjust the row grid from `sm:grid-cols-5` to `sm:grid-cols-6` so cantidad / lote / existencia / caducidad / ubicación / quitar all fit.
4. Remove the now-redundant "Lote X: N en existencia" helper line below each row (expiry is already shown in its own date field, stock now in its own field).

No backend or data changes; presentation only.
