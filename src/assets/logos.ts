/**
 * IMV Logo variants — single source of truth.
 *
 * - `logoFullDark`  → full lockup on the brand navy background (use on light
 *                      surfaces where you want a contained, finished badge).
 * - `logoFullWhite` → full lockup, white + teal, transparent background.
 *                      Use on dark / colored surfaces (sidebar header, dark
 *                      hero, footers).
 * - `logoIconBlue`  → just the "imv." mark in brand navy + teal dot.
 *                      Use on light surfaces (favicons, light navbars,
 *                      compact spaces).
 * - `logoIconWhite` → "imv." mark in white + teal dot. Use on dark surfaces
 *                      where the full lockup is too wide.
 */
import logoFullDarkPtr from "./imv-logo-full-dark.png.asset.json";
import logoFullWhitePtr from "./imv-logo-full-white.png.asset.json";
import logoIconBluePtr from "./imv-icon-blue.png.asset.json";
import logoIconWhitePtr from "./imv-icon-white.png.asset.json";

export const logoFullDark = logoFullDarkPtr.url;
export const logoFullWhite = logoFullWhitePtr.url;
export const logoIconBlue = logoIconBluePtr.url;
export const logoIconWhite = logoIconWhitePtr.url;

export const imvLogos = {
  fullDark: logoFullDark,
  fullWhite: logoFullWhite,
  iconBlue: logoIconBlue,
  iconWhite: logoIconWhite,
} as const;
