import {
  LayoutDashboard, Users, Map as MapIcon, ClipboardList, Boxes, Sparkles,
  Trophy, CalendarDays, FileText, Banknote, RotateCcw, UserPlus, Target,
  CalendarCheck2, ShoppingBag, Swords, type LucideIcon,
} from "lucide-react";

export type RepNavItem = {
  key: string;
  to: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  mobilePrimary?: boolean;
  adminOnly?: boolean;
  group: string;
};

export type RepNavSubGroup = { label?: string; items: Omit<RepNavItem, "group">[] };
export type RepNavGroup = { label: string; subgroups: RepNavSubGroup[] };

export const repNavGroups: RepNavGroup[] = [
  {
    label: "Inicio",
    subgroups: [
      {
        items: [
          { key: "rep-inicio", to: "/rep", label: "Inicio", icon: LayoutDashboard, exact: true, mobilePrimary: true },
        ],
      },
    ],
  },
  {
    label: "Clientes",
    subgroups: [
      {
        items: [
          { key: "rep-clientes", to: "/rep/clientes", label: "Clientes", icon: Users, mobilePrimary: true },
          { key: "rep-prospectos", to: "/rep/prospectos", label: "Prospectos", icon: UserPlus },
        ],
      },
    ],
  },
  {
    label: "Ruteo",
    subgroups: [
      {
        label: "Planeación",
        items: [
          { key: "rep-ruta", to: "/rep/ruta", label: "Ruta", icon: MapIcon, mobilePrimary: true },
          { key: "rep-plan", to: "/rep/plan", label: "Plan semanal", icon: ClipboardList },
          { key: "rep-calendario", to: "/rep/calendario", label: "Calendario", icon: CalendarDays },
        ],
      },
      {
        label: "Campo",
        items: [
          { key: "rep-visitas", to: "/rep/visitas", label: "Visitas", icon: ClipboardList, mobilePrimary: true },
          { key: "rep-cierre", to: "/rep/cierre", label: "Cierre de día", icon: CalendarCheck2 },
        ],
      },
    ],
  },
  {
    label: "Ventas",
    subgroups: [
      {
        items: [
          { key: "rep-pedidos", to: "/rep/cotizaciones", label: "Pedidos", icon: FileText },
          { key: "rep-catalogo", to: "/rep/catalogo", label: "Catálogo", icon: ShoppingBag },
          { key: "rep-devoluciones", to: "/rep/devoluciones", label: "Devoluciones", icon: RotateCcw },
          { key: "rep-cobranza", to: "/rep/cobranza", label: "Cobranza", icon: Banknote },
        ],
      },
    ],
  },
  {
    label: "Inventario",
    subgroups: [
      {
        items: [
          { key: "rep-inventario", to: "/rep/inventario", label: "Inventario", icon: Boxes },
          { key: "rep-laboratorios", to: "/rep/laboratorios", label: "Laboratorios", icon: ClipboardList },
        ],
      },
    ],
  },
  {
    label: "Inteligencia",
    subgroups: [
      {
        items: [
          { key: "rep-metas", to: "/rep/metas", label: "Metas", icon: Target },
          { key: "rep-competencia", to: "/rep/competencia", label: "Competencia", icon: Swords },
          { key: "rep-coach", to: "/rep/coach", label: "Coach IA", icon: Sparkles },
          { key: "rep-supervisor", to: "/rep/supervisor", label: "Supervisor", icon: Trophy, adminOnly: true },
        ],
      },
    ],
  },
];

export function flattenRepNav(groups: RepNavGroup[]): RepNavItem[] {
  return groups.flatMap((g) =>
    g.subgroups.flatMap((sg) => sg.items.map((i) => ({ ...i, group: g.label }))),
  );
}

export function isRepItemActive(pathname: string, to: string, exact?: boolean) {
  return exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");
}

export function norm(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
