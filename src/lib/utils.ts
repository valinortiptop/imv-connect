import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function titleCase(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toString()
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function userLabel(u: any): string {
  if (!u) return "";
  const name = u.full_name || u.name || u.display_name || u.username;
  if (name) return String(name);
  const email = u.email;
  if (email) return String(email).split("@")[0];
  return u.id ? String(u.id).slice(0, 8) : "";
}
