import { flattenNav, isItemActive, navGroups, type NavGroup } from "@/components/nav-items";

export type PageTitle = { title: string; section: string | null; detail: string | null };

const FALLBACK: PageTitle = { title: "Panel de administración", section: null, detail: null };

/**
 * Título del encabezado según la página abierta: la opción del menú que mejor
 * coincide con la ruta. Las sub-páginas (detalle, nuevo) se muestran como
 * "Clientes › Detalle".
 */
export function resolveAdminPageTitle(pathname: string, groups: NavGroup[] = navGroups): PageTitle {
  const path = pathname.replace(/\/+$/, "") || "/";
  const match = flattenNav(groups)
    .filter((i) => isItemActive(path, i.url, i.exact))
    .sort((a, b) => b.url.length - a.url.length)[0];
  if (!match) return FALLBACK;

  let detail: string | null = null;
  if (path !== match.url) {
    const last = path.split("/").pop() ?? "";
    if (/^(new|nuevo|nueva)$/i.test(last)) detail = "Nuevo";
    else if (/^[0-9a-f-]{8,}$/i.test(last) || /^\d+$/.test(last)) detail = "Detalle";
    else {
      const words = last.replace(/[-_]+/g, " ").trim();
      detail = words ? words.charAt(0).toUpperCase() + words.slice(1) : null;
    }
    // /admin/clientes/<id>/precios → "Precios"
  }
  return { title: match.label, section: match.group, detail };
}
