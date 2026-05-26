/** Ordena productos: Ganador primero, Minino, Croqueta, después alfabético. */
export function sortProducts<T extends { nombre?: string | null }>(products: T[]): T[] {
  const priority = (name: string | null | undefined): number => {
    if (!name) return 3;
    const lower = name.toLowerCase();
    if (lower.includes("ganador")) return 0;
    if (lower.includes("minino")) return 1;
    if (lower.includes("croqueta")) return 2;
    return 3;
  };
  return [...products].sort((a, b) => {
    const pa = priority(a.nombre);
    const pb = priority(b.nombre);
    if (pa !== pb) return pa - pb;
    return (a.nombre ?? "").localeCompare(b.nombre ?? "");
  });
}
