/**
 * Reporte ADM — Data generator (Option B: real scale, real mix).
 *
 * Universe
 * --------
 *  • Fixed universe of 2,760 clients distributed across 12 rutas
 *    (230 clients per ruta). Stable forever — same clients every month.
 *  • Baseline month = April 2026. Universe grows +1.5%/month from there
 *    (carrying forward, so May 2026 = 2,801, Dec 2026 = 3,086, etc.).
 *    For past months relative to baseline we decay by the same rate.
 *  • Churn: 3% of revealed clients go dormant each month (deterministic
 *    per year+month).
 *
 * Pricing
 * -------
 *  • 20% markup applied on cost_with_iva:
 *        adm_price_with_iva = cost_with_iva × 1.20
 *
 * Mix & volume
 * ------------
 *  • Both product mix AND total bultos come from actual delivered
 *    sales (`order_items` joined to `orders` where status = Entregado)
 *    for the selected month. The caller passes the `soldMix` and the
 *    `totalBultos`. If totalBultos is 0 the generator returns an empty
 *    report.
 *
 * Per-visit lines
 * ---------------
 *  Visit frequency per client is a weighted random pick:
 *    60%  →  4 visits/month (weekly)
 *    25%  →  2 visits/month (quincenal)
 *    15%  →  1 visit/month  (mensual)
 *  Visits land on distinct Mon-Fri weekdays. Each visit row is one
 *  (client, product, date) tuple with its own piezas and importe.
 */

export type Municipio =
  | "Naucalpan de Juárez"
  | "Tlalnepantla de Baz"
  | "Atizapán de Zaragoza"
  | "Huixquilucan"
  | "Cuautitlán Izcalli";

export interface Shop {
  clave: string;
  nombre: string;
  municipio: Municipio;
  colonia: string;
  ruta: string;
}

export interface SaleRow {
  fecha: string;       // YYYY-MM-DD (Mon-Fri only)
  bodega: string;
  ruta: string;
  claveCliente: string;
  cliente: string;
  claveAdm: string;
  producto: string;
  piezas: number;
  precio: number;
  importe: number;
}

export interface CatalogItem {
  id: string;
  clave: string;
  brand: string;
  name: string;
  weight_kg: number;
  cost_with_iva: number | null;
}

/** Map of product_id → bultos sold (actual delivered for the month). */
export type SoldMix = Map<string, number>;

/* ─────────────── PRNG & helpers ─────────────── */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function pickWeighted<T>(rng: () => number, items: readonly [T, number][]): T {
  const total = items.reduce((a, [, w]) => a + w, 0);
  let r = rng() * total;
  for (const [item, w] of items) {
    r -= w;
    if (r <= 0) return item;
  }
  return items[items.length - 1][0];
}

function fisherYates<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ─────────────── Shop universe ─────────────── */

const MUNI_PREFIX: Record<Municipio, string> = {
  "Naucalpan de Juárez": "NAU",
  "Tlalnepantla de Baz": "TLA",
  "Atizapán de Zaragoza": "ATI",
  "Huixquilucan": "HUI",
  "Cuautitlán Izcalli": "CUA",
};

const MUNI_ORDER: Municipio[] = [
  "Naucalpan de Juárez",
  "Tlalnepantla de Baz",
  "Atizapán de Zaragoza",
  "Huixquilucan",
  "Cuautitlán Izcalli",
];

const COLONIAS: Record<Municipio, string[]> = {
  "Naucalpan de Juárez": [
    "San Mateo", "Loma Colorada", "San Andrés Atoto", "El Molinito",
    "La Mora", "Santa Cruz del Monte", "Lomas de San Mateo",
    "Plazas de Aragón", "Boulevares", "Tecamachalco", "Izcalli Chamapa",
    "San Esteban Huitzilacasco", "Palo Solo", "San Juan Totoltepec",
  ],
  "Tlalnepantla de Baz": [
    "San Bartolo Tenayuca", "Lázaro Cárdenas", "Loma Bonita",
    "Valle Ceylán", "La Joya Ixtacala", "Tlalnemex",
    "San Pedro Barrientos", "Atlanta", "Los Reyes Ixtacala",
    "El Tenayo", "San Juan Ixhuatepec",
  ],
  "Atizapán de Zaragoza": [
    "Lago de Guadalupe", "Adolfo López Mateos", "Villa de las Palmas",
    "Lomas de Atizapán", "Ciudad Adolfo López Mateos", "Hogares de Atizapán",
    "El Chaparral", "Hacienda del Parque", "Las Alamedas",
  ],
  "Huixquilucan": [
    "San Fernando", "Bosques de las Palmas", "La Herradura",
    "Jesús del Monte", "San Juan Yautepec", "Magdalena Chichicaspa",
    "Palo Solo", "Interlomas", "El Olivo",
  ],
  "Cuautitlán Izcalli": [
    "Centro Urbano", "La Piedad", "Cumbria", "Atlanta",
    "Bosques del Lago", "Fuentes del Valle", "San Francisco Tepojaco",
    "La Quebrada", "El Rosario", "Infonavit Norte",
  ],
};

const STORE_PATTERNS = [
  "Abarrotes {n}", "Miscelánea {n}", "Tienda {n}", "Super {n}",
  "Minisuper {n}", "La {n}", "Don {n}", "Doña {n}",
  "Abarrotes La {n}", "Miscelánea El {n}", "Tiendita {n}",
  "Abarrotes Los {n}", "La Esquina de {n}", "Mercadito {n}",
  "Mini Super {n}", "Expendio {n}",
] as const;

const FIRST_NAMES = [
  "Lupita", "Rosita", "Carmen", "Lucía", "María", "Juanita", "Martha",
  "Pedro", "Paco", "Don Chuy", "Don Beto", "Mike", "Toño", "Miguel",
  "Ángeles", "Susana", "Teresa", "Laura", "Patricia",
] as const;

const WORDS = [
  "Estrella", "Fortuna", "Paraíso", "Milagro", "Sol", "Luna", "Casita",
  "Economía", "Ahorro", "Azteca", "Hormiga", "Amistad", "Alegría",
  "Bendición", "Providencia", "Sirenita", "Gallito", "Águila",
  "Reina", "Príncipe", "Victoria", "Esperanza", "Abundancia",
] as const;

function makeStoreName(rng: () => number): string {
  const pattern = pick(rng, STORE_PATTERNS);
  const useName = rng() < 0.45;
  const token = useName ? pick(rng, FIRST_NAMES) : pick(rng, WORDS);
  return pattern.replace("{n}", token);
}

/** Universe constants. Total = 2,760. */
export const UNIVERSE_SIZE = 2760;
const CLIENTS_PER_MUNI: Record<Municipio, number> = {
  "Naucalpan de Juárez": 920,
  "Tlalnepantla de Baz": 690,
  "Cuautitlán Izcalli": 460,
  "Atizapán de Zaragoza": 460,
  "Huixquilucan": 230,
};

/** Route sizing targets (clients per route, per week). Range enforced by
 *  auto-splitting when a route would exceed the cap. */
const ROUTE_TARGET = 190;
const ROUTE_MAX = 210;
const ROUTE_MIN = 170;
const MIN_ROUTES = 15;

const UNIVERSE_SEED = 0x51ABE7;

/**
 * Build the 2,760-client universe. Stable across every call (deterministic
 * seed). Ruta assignment is computed per-month in buildMonthlySales so
 * routes can grow as the universe grows.
 */
export function buildShops(): Shop[] {
  const rng = mulberry32(UNIVERSE_SEED);
  const shops: Shop[] = [];
  const counters: Record<Municipio, number> = {
    "Naucalpan de Juárez": 0,
    "Tlalnepantla de Baz": 0,
    "Atizapán de Zaragoza": 0,
    "Huixquilucan": 0,
    "Cuautitlán Izcalli": 0,
  };

  for (const muni of MUNI_ORDER) {
    const count = CLIENTS_PER_MUNI[muni];
    for (let i = 0; i < count; i++) {
      counters[muni]++;
      const colonia = COLONIAS[muni][(counters[muni] - 1) % COLONIAS[muni].length];
      shops.push({
        clave: `${MUNI_PREFIX[muni]}-${String(counters[muni]).padStart(4, "0")}`,
        nombre: makeStoreName(rng),
        municipio: muni,
        colonia,
        ruta: "", // assigned in buildMonthlySales per month
      });
    }
  }
  return shops;
}

/**
 * Assign routes to revealed clients. Each route covers 170-210 clients
 * (target 190). Routes are numbered globally across municipios, starting
 * at R01. As the universe grows, new routes auto-spawn.
 *
 * Returns a new array of Shop objects (with ruta filled) so we don't mutate
 * the shared universe list.
 */
function assignRoutes(revealed: Shop[], rng: () => number): Shop[] {
  // Desired route count: enough to keep every route under ROUTE_MAX,
  // with at least MIN_ROUTES.
  const desired = Math.max(MIN_ROUTES, Math.ceil(revealed.length / ROUTE_TARGET));

  // Distribute routes across municipios proportional to client count.
  const muniCounts: Record<Municipio, number> = {
    "Naucalpan de Juárez": 0,
    "Tlalnepantla de Baz": 0,
    "Atizapán de Zaragoza": 0,
    "Huixquilucan": 0,
    "Cuautitlán Izcalli": 0,
  };
  for (const s of revealed) muniCounts[s.municipio]++;

  // Preliminary allocation by share, then fix to match desired count
  const routesPerMuni: Record<Municipio, number> = {
    "Naucalpan de Juárez": 0,
    "Tlalnepantla de Baz": 0,
    "Atizapán de Zaragoza": 0,
    "Huixquilucan": 0,
    "Cuautitlán Izcalli": 0,
  };
  let assigned = 0;
  for (const m of MUNI_ORDER) {
    const share = muniCounts[m] / revealed.length;
    routesPerMuni[m] = Math.max(1, Math.floor(share * desired));
    assigned += routesPerMuni[m];
  }
  // Fix rounding so total == desired
  while (assigned < desired) {
    // Give extra route to the muni with highest clients-per-route ratio
    let best: Municipio = "Naucalpan de Juárez";
    let bestRatio = -1;
    for (const m of MUNI_ORDER) {
      const r = muniCounts[m] / routesPerMuni[m];
      if (r > bestRatio) { bestRatio = r; best = m; }
    }
    routesPerMuni[best]++;
    assigned++;
  }
  while (assigned > desired) {
    // Remove route from least-stretched muni
    let worst: Municipio = "Huixquilucan";
    let worstRatio = Infinity;
    for (const m of MUNI_ORDER) {
      if (routesPerMuni[m] <= 1) continue;
      const r = muniCounts[m] / routesPerMuni[m];
      if (r < worstRatio) { worstRatio = r; worst = m; }
    }
    routesPerMuni[worst]--;
    assigned--;
  }

  // Assign route labels globally R01..RNN; within each muni, split clients
  // across its allocated routes with natural jitter in sizes (170-210).
  const result: Shop[] = [];
  let rutaN = 1;
  for (const m of MUNI_ORDER) {
    const muniClients = revealed.filter((s) => s.municipio === m);
    const routes = routesPerMuni[m];
    // Size each route with jitter so sizes land in ~ROUTE_MIN..ROUTE_MAX
    const baseSize = Math.floor(muniClients.length / routes);
    const remainder = muniClients.length % routes;
    const sizes: number[] = [];
    for (let r = 0; r < routes; r++) {
      let s = baseSize + (r < remainder ? 1 : 0);
      // Deterministic jitter ±12 clients to break up uniformity
      const jitter = Math.floor((rng() - 0.5) * 24);
      s += jitter;
      s = Math.max(ROUTE_MIN, Math.min(ROUTE_MAX, s));
      sizes.push(s);
    }
    // Re-balance so sizes sum to muniClients.length
    let diff = muniClients.length - sizes.reduce((a, b) => a + b, 0);
    let i = 0;
    while (diff !== 0 && sizes.length) {
      const delta = diff > 0 ? 1 : -1;
      const next = sizes[i % sizes.length] + delta;
      if (next >= ROUTE_MIN && next <= ROUTE_MAX) {
        sizes[i % sizes.length] = next;
        diff -= delta;
      }
      i++;
      if (i > 10000) break; // safety
    }
    // If still off due to caps, absorb into first route
    if (diff !== 0) sizes[0] += diff;

    let cursor = 0;
    for (const size of sizes) {
      const label = `R${String(rutaN).padStart(2, "0")}`;
      for (let c = 0; c < size && cursor < muniClients.length; c++) {
        result.push({ ...muniClients[cursor], ruta: label });
        cursor++;
      }
      rutaN++;
    }
  }
  return result;
}

/** Deterministic client tier: 4% special, 96% normal. */
function clientTier(clave: string): "normal" | "especial" {
  // FNV-1a-ish hash
  let h = 0x811c9dc5;
  for (let i = 0; i < clave.length; i++) {
    h ^= clave.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 100) < 4 ? "especial" : "normal";
}

/**
 * Per-client margin for the month. Normal tier lands in [18.00, 22.00],
 * especial tier in [10.00, 13.00]. Deterministic by (clave, year, month)
 * so same client + same month always yields the same margin. Two decimals.
 */
function clientMargin(clave: string, year: number, month0: number): number {
  const seed = `${clave}:${year}:${month0}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const u = ((h >>> 0) % 10000) / 10000; // 0..0.9999
  const tier = clientTier(clave);
  if (tier === "especial") {
    return 10 + u * 3; // 10.00 - 13.00
  }
  return 18 + u * 4;   // 18.00 - 22.00
}

/* ─────────────── Month math ─────────────── */

const BASELINE_YEAR = 2026;
const BASELINE_MONTH0 = 3; // Abril
const GROWTH_PER_MONTH = 0.015;
const CHURN_RATE = 0.03;

function monthsFromBaseline(year: number, month0: number): number {
  return (year - BASELINE_YEAR) * 12 + (month0 - BASELINE_MONTH0);
}

/**
 * How many of the 2,760 are revealed/onboarded this month. Grows or
 * decays at 1.5%/month relative to April 2026 = 2,760.
 */
export function universeSizeForMonth(year: number, month0: number): number {
  const months = monthsFromBaseline(year, month0);
  const size = Math.round(UNIVERSE_SIZE * Math.pow(1 + GROWTH_PER_MONTH, months));
  return Math.max(1, Math.min(UNIVERSE_SIZE * 3, size));
}

function businessDaysOfMonth(year: number, month0: number): string[] {
  const days: string[] = [];
  const d = new Date(year, month0, 1);
  while (d.getMonth() === month0) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      days.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      );
    }
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function monthSeed(year: number, month0: number): number {
  return ((UNIVERSE_SEED ^ ((year * 13) + (month0 + 1) * 997)) >>> 0);
}

/* ─────────────── Build monthly sales ─────────────── */

function admSku(clave: string): string {
  // Placeholder: real SKU = product's clave already.
  return clave;
}

export interface BuildOptions {
  year: number;
  month0: number;
  catalog: CatalogItem[];
  soldMix: SoldMix;          // product_id → bultos sold (actual delivered this month)
  totalBultos: number;       // override; defaults to sum(soldMix) if 0
  bodega?: string;
}

export interface BuildResult {
  shops: Shop[];
  rows: SaleRow[];
  totals: {
    bultos: number;
    importe: number;
    tiendas: number;
    porMarca: Record<string, { bultos: number; importe: number }>;
    porMunicipio: Record<string, { bultos: number; importe: number; tiendas: number }>;
  };
}

const VISIT_FREQ_WEIGHTS: readonly [number, number][] = [
  [4, 0.6],   // weekly
  [2, 0.25],  // quincenal
  [1, 0.15],  // monthly
];

export function buildMonthlySales(opts: BuildOptions): BuildResult {
  const { year, month0, catalog, soldMix, totalBultos: totalOverride, bodega = "CEDIS Naucalpan" } = opts;
  const allShops = buildShops();

  // Deterministic month-level PRNG
  const rng = mulberry32(monthSeed(year, month0));

  // Revealed universe for this month
  const revealedCount = Math.min(allShops.length, universeSizeForMonth(year, month0));
  const revealedRaw = allShops.slice(0, revealedCount);

  // Assign routes for this month (auto-grows as universe grows)
  const revealed = assignRoutes(
    revealedRaw,
    mulberry32(monthSeed(year, month0) ^ 0xc0ffee)
  );

  // Churn: pick 3% to be dormant this month
  const dormantCount = Math.round(revealed.length * CHURN_RATE);
  const shuffled = fisherYates(
    revealed.map((_, i) => i),
    mulberry32(monthSeed(year, month0) ^ 0xdeadbeef)
  );
  const dormantSet = new Set(shuffled.slice(0, dormantCount));
  const active = revealed.filter((_, i) => !dormantSet.has(i));

  // Universe for return object is the full revealed with routes assigned
  // (so the comparison view can look up either month's routing)
  const universeShops = revealed;

  // Early-exit: nothing to sell
  const soldTotal = Array.from(soldMix.values()).reduce((a, b) => a + b, 0);
  const totalBultos = totalOverride > 0 ? totalOverride : soldTotal;
  if (totalBultos <= 0 || soldMix.size === 0 || active.length === 0) {
    return {
      shops: universeShops,
      rows: [],
      totals: { bultos: 0, importe: 0, tiendas: 0, porMarca: {}, porMunicipio: {} },
    };
  }

  // Cost lookup
  const catalogById = new Map(catalog.map((c) => [c.id, c]));

  // Build weighted SKU pool from sold mix, normalized to totalBultos.
  // Ensure sum of per-SKU bultos = totalBultos (up to ±1 from rounding).
  type SkuAlloc = { item: CatalogItem; bultos: number };
  const skuAllocs: SkuAlloc[] = [];
  let allocated = 0;
  const mixEntries = Array.from(soldMix.entries());
  mixEntries.forEach(([productId, soldQty], i) => {
    const item = catalogById.get(productId);
    if (!item) return;
    const share = soldQty / soldTotal;
    const qty = i === mixEntries.length - 1
      ? Math.max(0, totalBultos - allocated)
      : Math.round(share * totalBultos);
    allocated += qty;
    if (qty > 0) skuAllocs.push({ item, bultos: qty });
  });

  // Step 1: allocate total bultos per client with a mild log-normal
  // distribution. Less skew than rng()² so the long tail still gets served.
  // Guarantees: every active client gets at least 1 bulto when totalBultos ≥
  // active.length; otherwise we give 1 bulto to the top `totalBultos`
  // clients.
  const totalActive = active.length;
  const baseWeights = active.map(() => 0.3 + rng() * rng()); // roughly 0.3 → 1.3
  const baseSum = baseWeights.reduce((a, b) => a + b, 0) || 1;

  const bultosPerClient: number[] = new Array(totalActive).fill(0);
  if (totalBultos >= totalActive) {
    // Give everyone 1, then distribute the rest proportionally
    for (let i = 0; i < totalActive; i++) bultosPerClient[i] = 1;
    let remaining = totalBultos - totalActive;
    // Initial proportional fill (floor)
    let placed = 0;
    for (let i = 0; i < totalActive; i++) {
      const extra = Math.floor((baseWeights[i] / baseSum) * remaining);
      bultosPerClient[i] += extra;
      placed += extra;
    }
    // Distribute rounding residue one-by-one to randomly weighted clients
    let residue = remaining - placed;
    while (residue > 0) {
      // Pick a client with probability ∝ baseWeights
      let r = rng() * baseSum;
      for (let i = 0; i < totalActive; i++) {
        r -= baseWeights[i];
        if (r <= 0) { bultosPerClient[i] += 1; break; }
      }
      residue--;
    }
  } else {
    // totalBultos < totalActive: only the top `totalBultos` clients get 1
    const ordered = baseWeights
      .map((w, i) => ({ w, i }))
      .sort((a, b) => b.w - a.w)
      .slice(0, totalBultos);
    for (const { i } of ordered) bultosPerClient[i] = 1;
  }

  // Step 2: within each client, split their total across SKUs weighted by
  // the real mix proportions.
  const mixShares: { item: CatalogItem; share: number }[] = skuAllocs
    .map((a) => ({ item: a.item, share: a.bultos / totalBultos }))
    .filter((x) => x.share > 0);

  /** client_idx → Map<product_id, bultos> */
  const clientSkuBultos = new Map<number, Map<string, number>>();

  for (let i = 0; i < totalActive; i++) {
    const clientBultos = bultosPerClient[i];
    if (clientBultos <= 0) continue;
    const skuMap = new Map<string, number>();
    let placed = 0;
    // Allocate proportionally (floor)
    for (const ms of mixShares) {
      const q = Math.floor(ms.share * clientBultos);
      if (q > 0) {
        skuMap.set(ms.item.id, q);
        placed += q;
      }
    }
    // Distribute residue to random SKUs weighted by share
    let residue = clientBultos - placed;
    while (residue > 0) {
      let r = rng();
      let picked: CatalogItem | null = null;
      for (const ms of mixShares) {
        r -= ms.share;
        if (r <= 0) { picked = ms.item; break; }
      }
      if (!picked && mixShares.length > 0) picked = mixShares[mixShares.length - 1].item;
      if (picked) skuMap.set(picked.id, (skuMap.get(picked.id) ?? 0) + 1);
      residue--;
    }
    if (skuMap.size > 0) clientSkuBultos.set(i, skuMap);
  }

  // Business days available this month
  const days = businessDaysOfMonth(year, month0);
  if (days.length === 0) {
    return {
      shops: universeShops,
      rows: [],
      totals: { bultos: 0, importe: 0, tiendas: 0, porMarca: {}, porMunicipio: {} },
    };
  }

  // Generate per-visit rows
  const rows: SaleRow[] = [];
  for (const [clientIdx, skuMap] of clientSkuBultos.entries()) {
    const shop = active[clientIdx];
    const totalClient = Array.from(skuMap.values()).reduce((a, b) => a + b, 0);
    if (totalClient <= 0) continue;

    // Visit count — weighted by 4/2/1
    const desiredVisits = pickWeighted(rng, VISIT_FREQ_WEIGHTS);

    // Cap visits at available weekdays
    const visitCount = Math.min(desiredVisits, days.length, Math.max(1, totalClient));

    // Pick distinct business days
    const dayIdx = fisherYates(
      Array.from({ length: days.length }, (_, i) => i),
      rng
    ).slice(0, visitCount);
    dayIdx.sort((a, b) => a - b);
    const visitDates = dayIdx.map((i) => days[i]);

    // Per-client margin for this month (varies 18-22% normal, 10-13% especial)
    const marginPct = clientMargin(shop.clave, year, month0);
    const markup = 1 + marginPct / 100;

    // For each SKU bought by this client, split its piezas across the N visits.
    // Each SKU picks its OWN random starting visit slot so multiple SKUs
    // don't collapse onto the same calendar day — this preserves the
    // intended per-visit row count.
    for (const [productId, pz] of skuMap.entries()) {
      const item = catalogById.get(productId);
      if (!item) continue;
      const cost = item.cost_with_iva ?? 0;
      const precio = Math.round(cost * markup * 100) / 100;
      if (precio <= 0) continue;

      const buckets = Math.min(visitCount, pz);
      const splits = splitInteger(pz, buckets, rng);
      // Rotate starting slot so consecutive SKUs land on different visit days
      const startSlot = Math.floor(rng() * visitCount);
      for (let b = 0; b < buckets; b++) {
        const piezas = splits[b];
        if (piezas <= 0) continue;
        const slot = (startSlot + b) % visitCount;
        const fecha = visitDates[slot] ?? visitDates[visitDates.length - 1];
        rows.push({
          fecha,
          bodega,
          ruta: shop.ruta,
          claveCliente: shop.clave,
          cliente: shop.nombre,
          claveAdm: admSku(item.clave),
          producto: item.name,
          piezas,
          precio,
          importe: Math.round(piezas * precio * 100) / 100,
        });
      }
    }
  }

  // Sort by fecha → ruta → cliente
  rows.sort((a, b) =>
    a.fecha.localeCompare(b.fecha) ||
    a.ruta.localeCompare(b.ruta) ||
    a.claveCliente.localeCompare(b.claveCliente) ||
    a.producto.localeCompare(b.producto)
  );

  // Totals
  const porMarca: Record<string, { bultos: number; importe: number }> = {};
  const porMunicipio: Record<string, { bultos: number; importe: number; tiendas: number }> = {};
  const shopByClave = new Map(universeShops.map((s) => [s.clave, s]));
  const seen = new Set<string>();
  let bultos = 0;
  let importe = 0;

  for (const r of rows) {
    bultos += r.piezas;
    importe += r.importe;

    const item = catalog.find((c) => c.clave === r.claveAdm);
    const brand = item?.brand ?? "—";
    if (!porMarca[brand]) porMarca[brand] = { bultos: 0, importe: 0 };
    porMarca[brand].bultos += r.piezas;
    porMarca[brand].importe += r.importe;

    const muni = shopByClave.get(r.claveCliente)?.municipio ?? "—";
    if (!porMunicipio[muni]) porMunicipio[muni] = { bultos: 0, importe: 0, tiendas: 0 };
    porMunicipio[muni].bultos += r.piezas;
    porMunicipio[muni].importe += r.importe;

    const key = `${muni}::${r.claveCliente}`;
    if (!seen.has(key)) {
      seen.add(key);
      porMunicipio[muni].tiendas += 1;
    }
  }

  return {
    shops: universeShops,
    rows,
    totals: {
      bultos,
      importe: Math.round(importe * 100) / 100,
      tiendas: seen.size,
      porMarca,
      porMunicipio,
    },
  };
}

/**
 * Split a positive integer `total` into `n` non-negative buckets with a
 * biased-random distribution. Sum of buckets = total.
 */
function splitInteger(total: number, n: number, rng: () => number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [total];
  if (total <= 0) return Array(n).fill(0);
  // Uniform random breakpoints
  const cuts = Array.from({ length: n - 1 }, () => Math.floor(rng() * total));
  cuts.sort((a, b) => a - b);
  const res: number[] = [];
  let prev = 0;
  for (const c of cuts) { res.push(c - prev); prev = c; }
  res.push(total - prev);
  return res;
}

/* ─────────────── Formatting helpers ─────────────── */

export const fmtMXN = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 }).format(n);

export const fmtInt = (n: number) =>
  new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(n);

export const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
] as const;
