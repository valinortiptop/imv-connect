/** Ordena productos: Ganador primero, Minino, Croqueta, después alfabético. */
export function sortProducts<T extends { nombre?: string | null; name?: string | null }>(products: T[]): T[] {
  const getName = (p: T) => p.nombre ?? p.name ?? "";
  const priority = (name: string): number => {
    if (!name) return 3;
    const lower = name.toLowerCase();
    if (lower.includes("ganador")) return 0;
    if (lower.includes("minino")) return 1;
    if (lower.includes("croqueta")) return 2;
    return 3;
  };
  return [...products].sort((a, b) => {
    const na = getName(a);
    const nb = getName(b);
    const pa = priority(na);
    const pb = priority(nb);
    if (pa !== pb) return pa - pb;
    return na.localeCompare(nb);
  });
}
