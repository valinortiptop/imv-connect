// Availability grid math. Slots are "YYYY-MM-DDTHH:MM" in America/Mexico_City local time, 30 min each.
export const SLOT_MIN = 30;
export const TZ = "America/Mexico_City";

export type Person = { person_name: string; role_key: string; slots: string[] };
/** A named person who is responsible for extra areas (their hours count for each of them). */
export type Assignment = { name: string; roles: string[] };

export const normName = (s: string) =>
  s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const matches = (person: string, a: Assignment) => {
  const p = normName(person), n = normName(a.name);
  return p === n || p.startsWith(`${n} `);
};

/** Extra areas a person covers through assignments. */
export function assignedRoles(person: string, assignments: Assignment[] = []): string[] {
  return [...new Set(assignments.filter((a) => matches(person, a)).flatMap((a) => a.roles))];
}

/**
 * Adds one entry per extra area for people with assignments, so their hours count for those areas.
 * The person keeps one name, so they're never booked in two sessions at once.
 */
export function expandPeople<T extends Person>(people: T[], assignments: Assignment[] = []): T[] {
  if (!assignments.length) return people;
  const out = [...people];
  const has = new Set(people.map((p) => `${normName(p.person_name)}|${p.role_key}`));
  for (const p of people) {
    for (const r of assignedRoles(p.person_name, assignments)) {
      const k = `${normName(p.person_name)}|${r}`;
      if (!has.has(k)) { has.add(k); out.push({ ...p, role_key: r }); }
    }
  }
  return out;
}

export type RoleAttendance = { role: string; present: string[]; busy: string[]; expected: string[] };
/**
 * Who can attend a session at `slot`, per required area:
 * present = free for the whole session, busy = marked hours but not free then,
 * expected = assigned people who haven't marked any hours yet.
 */
export function sessionAttendance(
  people: Person[], roles: string[], slot: string, minutes: number, assignments: Assignment[] = [],
): RoleAttendance[] {
  const need = Math.max(1, Math.ceil(minutes / SLOT_MIN));
  const start = slotMin(slot);
  const block = Array.from({ length: need }, (_, i) => minToSlot(start + i * SLOT_MIN));
  return roles.map((role) => {
    const inRole = people.filter((p) => p.role_key === role && p.slots.length);
    const present = [...new Set(inRole.filter((p) => block.every((s) => p.slots.includes(s))).map((p) => p.person_name))];
    const busy = [...new Set(inRole.map((p) => p.person_name))].filter((n) => !present.includes(n));
    const expected = assignments
      .filter((a) => a.roles.includes(role) && !people.some((p) => p.slots.length && matches(p.person_name, a)))
      .map((a) => a.name);
    return { role, present, busy, expected };
  });
}

const minToSlot = (m: number) => new Date(m * 60000).toISOString().slice(0, 16);

export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Weekdays (Mon–Fri) in the window. */
export function windowDays(start: string, days: number): string[] {
  const out: string[] = [];
  for (let i = 0; out.length < days && i < days * 3; i++) {
    const d = addDays(start, i);
    const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(d);
  }
  return out;
}

export function daySlots(day: string, startHour: number, endHour: number): string[] {
  const out: string[] = [];
  for (let m = startHour * 60; m < endHour * 60; m += SLOT_MIN) {
    out.push(`${day}T${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
}

const SLOT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:(00|30)$/;
export const isSlot = (s: string) => SLOT_RE.test(s);

export type Candidate = { start: string; rolesCovered: string[]; rolesMissing: string[]; people: string[]; score: number };

/**
 * Best start slots for a session: each required role counts once if at least one person
 * with that role is free for the whole duration. Ties broken by number of people free.
 */
export function bestSlots(
  people: Person[], roles: string[], minutes: number,
  days: string[], startHour: number, endHour: number, limit = 3,
): Candidate[] {
  return allCandidates(people, roles, minutes, days, startHour, endHour)
    .sort((a, b) => b.score - a.score || a.start.localeCompare(b.start)).slice(0, limit);
}

const slotMin = (slot: string) => Date.parse(`${slot}:00Z`) / 60000;

export type PlanSession = { key: string; roles: string[]; minutes: number; week?: string };
export type PlanOption = Candidate & { outOfOrder: boolean };
export type PlanEntry = { pick: Candidate | null; alts: PlanOption[] };
type Booked = { start: number; end: number; roles: Set<string>; people: Set<string> };

/** Break kept between two sessions that share a person or area on the same day. */
export const BREAK_MIN = 30;
/** Soft limit of session time per area per day; going over is allowed only if nothing better exists. */
export const DAY_CAP_MIN = 240;

const clashes = (b: Booked[], start: number, end: number, roles: string[], people: string[]) =>
  b.some((x) => start < x.end + BREAK_MIN && x.start < end + BREAK_MIN &&
    (roles.some((r) => x.roles.has(r)) || people.some((p) => x.people.has(p))));

/**
 * Proposes one time per session so that:
 * - sessions go strictly in template order (02 starts after 01 ends, 03 after 02, ...),
 * - several sessions can share a day, back to back with a 30-minute break when they share people,
 * - every required area has someone free for the whole session (best coverage wins),
 * - no person or area is booked in two sessions at once (confirmed sessions included),
 * - the earliest slot wins among equals, so the plan packs into as few days as people allow,
 * - nobody gets more than ~4 h of sessions a day unless that's the only way to cover everyone,
 * - week-1 sessions prefer the first week of the window, later ones the second.
 * Also returns up to `altCount` other valid times per session (marked if they break the order).
 * Slots before `notBefore` (e.g. nowSlot()) are never proposed.
 */
export function planSchedule(
  people: Person[], sessions: PlanSession[], days: string[], startHour: number, endHour: number,
  confirmed: Record<string, string> = {}, opts: { altCount?: number; notBefore?: string } = {},
): Record<string, PlanEntry> {
  const altCount = opts.altCount ?? 2;
  const booked: Booked[] = [];
  const dayLoad = new Map<string, number>(); // `${day}|${role}` -> minutes
  const out: Record<string, PlanEntry> = {};
  const split = days.length >= 10 ? 5 : Math.ceil(days.length / 2);
  const firstWeek = new Set(days.slice(0, split));
  const loadKeys = (day: string, roles: string[], who: string[]) =>
    [...roles.map((r) => `${day}|${r}`), ...who.map((p) => `${day}|@${p}`)];
  const book = (s: PlanSession, slot: string, who: string[]) => {
    const start = slotMin(slot);
    booked.push({ start, end: start + s.minutes, roles: new Set(s.roles), people: new Set(who) });
    for (const k of loadKeys(slot.slice(0, 10), s.roles, who)) dayLoad.set(k, (dayLoad.get(k) ?? 0) + s.minutes);
  };
  // Confirmed sessions also block the people who are free at that time (one person can cover several areas).
  for (const s of sessions) {
    const slot = confirmed[s.key];
    if (slot) book(s, slot, sessionAttendance(people, s.roles, slot, s.minutes).flatMap((a) => a.present));
  }

  let floor = -Infinity;
  for (const s of sessions) {
    const conf = confirmed[s.key];
    if (conf) { floor = Math.max(floor, slotMin(conf) + s.minutes); out[s.key] = { pick: null, alts: [] }; continue; }
    const wantFirstWeek = (s.week ?? "w1") === "w1";
    const options = allCandidates(people, s.roles, s.minutes, days, startHour, endHour)
      .filter((c) => !opts.notBefore || c.start >= opts.notBefore)
      .filter((c) => !clashes(booked, slotMin(c.start), slotMin(c.start) + s.minutes, s.roles, c.people))
      .map((c) => {
        const day = c.start.slice(0, 10);
        const over = loadKeys(day, s.roles, c.people).some((k) => (dayLoad.get(k) ?? 0) + s.minutes > DAY_CAP_MIN);
        const score = c.rolesCovered.length * 100
          - (firstWeek.has(day) === wantFirstWeek ? 0 : 50)
          - (over ? 60 : 0);
        return { c: { ...c, outOfOrder: slotMin(c.start) < floor }, score };
      })
      .sort((a, b) => b.score - a.score || Number(a.c.outOfOrder) - Number(b.c.outOfOrder) || a.c.start.localeCompare(b.c.start));
    const pickOpt = options.find((o) => !o.c.outOfOrder);
    const pick = pickOpt ? (({ outOfOrder: _o, ...c }) => c)(pickOpt.c) : null;
    out[s.key] = { pick, alts: options.filter((o) => o !== pickOpt).slice(0, altCount).map((o) => o.c) };
    if (pick) { book(s, pick.start, pick.people); floor = slotMin(pick.start) + s.minutes; }
  }
  return out;
}

/** Proposed time per session (see planSchedule). */
export function planSessions(
  people: Person[], sessions: PlanSession[], days: string[], startHour: number, endHour: number,
  confirmed: Record<string, string> = {}, notBefore?: string,
): Record<string, Candidate | null> {
  const plan = planSchedule(people, sessions, days, startHour, endHour, confirmed, { altCount: 0, notBefore });
  return Object.fromEntries(sessions.filter((s) => !confirmed[s.key]).map((s) => [s.key, plan[s.key].pick]));
}

function allCandidates(
  people: Person[], roles: string[], minutes: number,
  days: string[], startHour: number, endHour: number,
): Candidate[] {
  const need = Math.max(1, Math.ceil(minutes / SLOT_MIN));
  // Only people from the session's areas count (and get booked); others aren't invited.
  const sets = people.filter((p) => roles.includes(p.role_key)).map((p) => ({ ...p, set: new Set(p.slots) }));
  const out: Candidate[] = [];
  for (const day of days) {
    const slots = daySlots(day, startHour, endHour);
    for (let i = 0; i + need <= slots.length; i++) {
      const block = slots.slice(i, i + need);
      const free = sets.filter((p) => block.every((s) => p.set.has(s)));
      if (free.length === 0) continue;
      const covered = roles.filter((r) => free.some((p) => p.role_key === r));
      out.push({
        start: slots[i],
        rolesCovered: covered,
        rolesMissing: roles.filter((r) => !covered.includes(r)),
        people: [...new Set(free.map((p) => p.person_name))],
        score: covered.length * 100 + new Set(free.map((p) => p.person_name)).size,
      });
    }
  }
  return out;
}

/** The next 30-minute slot from `now`, in CDMX local time (UTC-6, no DST). */
export function nowSlot(now: Date = new Date()): string {
  const local = new Date(now.getTime() - 6 * 3600000);
  const m = Math.ceil((local.getUTCHours() * 60 + local.getUTCMinutes()) / SLOT_MIN) * SLOT_MIN;
  const d = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + m * 60000);
  return d.toISOString().slice(0, 16);
}

/** Convert a CDMX local slot to a UTC ISO string (Mexico has no DST since 2022: UTC-6). */
export function slotToUtcIso(slot: string): string {
  return new Date(`${slot}:00-06:00`).toISOString();
}

export function icsFor(title: string, slot: string, minutes: number, description = ""): string {
  const start = new Date(slotToUtcIso(slot));
  const end = new Date(start.getTime() + minutes * 60000);
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/[,;\\]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Valinor Studio//Launch//ES", "BEGIN:VEVENT",
    `UID:${slot}-${title.length}@valinor.studio`, `DTSTAMP:${f(new Date())}`,
    `DTSTART:${f(start)}`, `DTEND:${f(end)}`, `SUMMARY:${esc(title)}`, `DESCRIPTION:${esc(description)}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
}
