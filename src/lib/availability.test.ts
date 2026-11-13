// @ts-nocheck — run with `bun test`
import { describe, it, expect } from "bun:test";
import { bestSlots, planSessions, planSchedule, nowSlot, windowDays, slotToUtcIso, daySlots } from "./availability";

describe("availability", () => {
  it("skips weekends in the window", () => {
    // 2026-11-13 is a Friday
    expect(windowDays("2026-11-13", 3)).toEqual(["2026-11-13", "2026-11-16", "2026-11-17"]);
  });
  it("builds 30-minute slots", () => {
    expect(daySlots("2026-11-16", 9, 10)).toEqual(["2026-11-16T09:00", "2026-11-16T09:30"]);
  });
  it("prefers the slot where every required role is free for the whole session", () => {
    const people = [
      { person_name: "Ana", role_key: "direccion", slots: ["2026-11-16T09:00", "2026-11-16T09:30", "2026-11-16T10:00"] },
      { person_name: "Mari", role_key: "mari", slots: ["2026-11-16T09:30", "2026-11-16T10:00"] },
    ];
    const best = bestSlots(people, ["direccion", "mari"], 60, ["2026-11-16"], 9, 11, 1)[0];
    expect(best.start).toBe("2026-11-16T09:30");
    expect(best.rolesMissing).toEqual([]);
  });
  it("reports a missing role", () => {
    const people = [{ person_name: "Ana", role_key: "direccion", slots: ["2026-11-16T09:00", "2026-11-16T09:30"] }];
    expect(bestSlots(people, ["direccion", "contador"], 60, ["2026-11-16"], 9, 11)[0].rolesMissing).toEqual(["contador"]);
  });
  it("converts CDMX local time to UTC", () => {
    expect(slotToUtcIso("2026-11-16T09:00")).toBe("2026-11-16T15:00:00.000Z");
  });
});

describe("planSessions", () => {
  const day1 = "2026-11-16", day2 = "2026-11-17";
  const hrs = (d: string, from: number, to: number) => daySlots(d, from, to);
  const sessions = [
    { key: "s01", roles: ["direccion", "ti", "valinor"], minutes: 60, week: "w1" },
    { key: "s02", roles: ["mari", "ti", "valinor"], minutes: 60, week: "w1" },
  ];
  const doris = { person_name: "Doris", role_key: "ti", slots: [...hrs(day1, 9, 13), ...hrs(day2, 9, 13)] };
  const val = { person_name: "Eduardo", role_key: "valinor", slots: [...hrs(day1, 9, 13), ...hrs(day2, 9, 13)] };

  it("never books Doris (in every session) twice at the same time", () => {
    const people = [doris, val,
      { person_name: "Ana", role_key: "direccion", slots: hrs(day1, 9, 10) },
      { person_name: "Mari", role_key: "mari", slots: hrs(day1, 9, 12) }];
    const plan = planSessions(people, sessions, [day1, day2], 9, 13);
    expect(plan.s01!.start).toBe("2026-11-16T09:00");
    expect(plan.s02!.start).toBe("2026-11-16T10:30");
    expect(plan.s02!.rolesMissing).toEqual([]);
  });
  it("schedules other sessions after session 01", () => {
    const people = [doris, val,
      { person_name: "Ana", role_key: "direccion", slots: hrs(day2, 9, 10) },
      { person_name: "Mari", role_key: "mari", slots: [...hrs(day1, 9, 10), ...hrs(day2, 11, 12)] }];
    const plan = planSessions(people, sessions, [day1, day2], 9, 13);
    expect(plan.s01!.start).toBe("2026-11-17T09:00");
    expect(plan.s02!.start).toBe("2026-11-17T11:00");
  });
  it("works around a session that is already confirmed", () => {
    const people = [doris, val, { person_name: "Mari", role_key: "mari", slots: hrs(day1, 9, 12) }];
    const plan = planSessions(people, sessions, [day1], 9, 13, { s01: "2026-11-16T09:00" });
    expect(plan.s02!.start).toBe("2026-11-16T10:30");
  });
  it("flags Doris missing when she has not marked hours", () => {
    const people = [val, { person_name: "Mari", role_key: "mari", slots: hrs(day1, 9, 11) }];
    const plan = planSessions(people, [sessions[1]], [day1], 9, 13);
    expect(plan.s02!.rolesMissing).toEqual(["ti"]);
  });

  const three = [
    { key: "s01", roles: ["ti", "valinor"], minutes: 60, week: "w1" },
    { key: "s02", roles: ["mari", "ti", "valinor"], minutes: 60, week: "w1" },
    { key: "s03", roles: ["almacen", "ti", "valinor"], minutes: 60, week: "w1" },
  ];
  it("fits several sessions in one day, in order, with a break between them", () => {
    const people = [doris, val,
      { person_name: "Mari", role_key: "mari", slots: hrs(day1, 9, 13) },
      { person_name: "Luis", role_key: "almacen", slots: hrs(day1, 9, 13) }];
    const plan = planSessions(people, three, [day1, day2], 9, 13);
    expect([plan.s01!.start, plan.s02!.start, plan.s03!.start])
      .toEqual(["2026-11-16T09:00", "2026-11-16T10:30", "2026-11-16T12:00"]);
  });
  it("keeps the order even when a later session's people are free earlier", () => {
    const people = [doris, val,
      { person_name: "Mari", role_key: "mari", slots: hrs(day2, 9, 13) },
      { person_name: "Luis", role_key: "almacen", slots: [...hrs(day1, 11, 12), ...hrs(day2, 11, 13)] }];
    const plan = planSchedule(people, three, [day1, day2], 9, 13);
    expect(plan.s02.pick!.start).toBe("2026-11-17T09:00");
    expect(plan.s03.pick!.start).toBe("2026-11-17T11:00"); // not day 1 at 11:00
    expect(plan.s03.alts.find((a) => a.start === "2026-11-16T11:00")?.outOfOrder).toBe(true);
  });
  it("moves a session to the next day instead of passing 4 hours in one day", () => {
    const long = [
      { key: "a", roles: ["ti", "valinor"], minutes: 120, week: "w1" },
      { key: "b", roles: ["ti", "valinor"], minutes: 120, week: "w1" },
      { key: "c", roles: ["ti", "valinor"], minutes: 60, week: "w1" },
    ];
    const wide = (p: typeof doris) => ({ ...p, slots: [...hrs(day1, 9, 18), ...hrs(day2, 9, 18)] });
    const plan = planSessions([wide(doris), wide(val)], long, [day1, day2], 9, 18);
    expect(plan.a!.start).toBe("2026-11-16T09:00");
    expect(plan.b!.start).toBe("2026-11-16T11:30");
    expect(plan.c!.start).toBe("2026-11-17T09:00");
  });
  it("never proposes a time that has already passed", () => {
    const people = [doris, val, { person_name: "Mari", role_key: "mari", slots: [...hrs(day1, 9, 13), ...hrs(day2, 9, 13)] }];
    const plan = planSchedule(people, sessions, [day1, day2], 9, 13, {}, { notBefore: "2026-11-16T12:30" });
    expect(plan.s01.pick!.start).toBe("2026-11-17T09:00");
    expect(plan.s01.alts.every((a) => a.start >= "2026-11-16T12:30")).toBe(true);
  });
  it("rounds now up to the next half hour in Mexico City", () => {
    expect(nowSlot(new Date("2026-11-10T16:23:00Z"))).toBe("2026-11-10T10:30");
    expect(nowSlot(new Date("2026-11-10T16:00:00Z"))).toBe("2026-11-10T10:00");
  });
});

describe("one person covering several areas", () => {
  const assignments = [{ name: "Eduardo Islas", roles: ["facturacion", "almacen", "cobranza"] }];
  const day = "2026-11-16";
  const slots = ["09:00", "09:30", "10:00", "10:30"].map((t) => `${day}T${t}`);
  it("counts Eduardo Islas's hours for Facturación, Almacén and Cobranza", async () => {
    const { expandPeople } = await import("./availability");
    const people = expandPeople([{ person_name: "Eduardo Islas", role_key: "contador", slots }], assignments);
    expect(people.map((p) => p.role_key).sort()).toEqual(["almacen", "cobranza", "contador", "facturacion"]);
    const best = bestSlots(people, ["facturacion", "almacen"], 60, [day], 9, 11, 1)[0];
    expect(best.rolesMissing).toEqual([]);
    expect(best.people).toEqual(["Eduardo Islas"]);
  });
  it("never books him in two sessions at once", async () => {
    const { expandPeople } = await import("./availability");
    const people = expandPeople([{ person_name: "Eduardo Islas", role_key: "contador", slots }], assignments);
    const plan = planSchedule(people, [
      { key: "a", roles: ["cobranza"], minutes: 60 },
      { key: "b", roles: ["almacen"], minutes: 60 },
    ], [day], 9, 11);
    expect(plan.a.pick?.start).toBe(`${day}T09:00`);
    expect(plan.b.pick).toBeNull(); // only 2 h free, and a 30-min break is needed after session a
  });
  it("names him as missing when he isn't free at the session time", async () => {
    const { expandPeople, sessionAttendance } = await import("./availability");
    const people = expandPeople([{ person_name: "Eduardo Islas", role_key: "contador", slots }], assignments);
    const att = sessionAttendance(people, ["almacen"], `${day}T14:00`, 60, assignments);
    expect(att[0]).toMatchObject({ role: "almacen", present: [], busy: ["Eduardo Islas"] });
    const none = sessionAttendance([], ["cobranza"], `${day}T14:00`, 60, assignments);
    expect(none[0].expected).toEqual(["Eduardo Islas"]);
  });
});
