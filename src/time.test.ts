import { describe, it, expect } from "vitest";
import { resolveWhen, formatDuration, formatDue } from "./time.js";

const NOW = new Date("2025-06-01T12:00:00");
const inMs = (ms: number) => new Date(NOW.getTime() + ms);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("resolveWhen: absolute clock times ('at')", () => {
	const at = (h: number, m: number, s = 0, dayOffset = 0) =>
		new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + dayOffset, h, m, s);

	it("parses 'at 14:30' later today", () => {
		const r = resolveWhen(["at", "14:30"], NOW);
		if (!("error" in r)) expect(r.dueAt.getTime()).toBe(at(14, 30).getTime());
		else throw new Error(r.error);
	});

	it("rolls 'at 9:00' to tomorrow when already past today", () => {
		const r = resolveWhen(["at", "9:00"], NOW);
		if (!("error" in r)) expect(r.dueAt.getTime()).toBe(at(9, 0, 0, 1).getTime());
		else throw new Error(r.error);
	});

	it("parses 'at 9am' with roll-forward", () => {
		const r = resolveWhen(["at", "9am"], NOW);
		if (!("error" in r)) expect(r.dueAt.getTime()).toBe(at(9, 0, 0, 1).getTime());
		else throw new Error(r.error);
	});

	it("parses 'at 5pm' later today", () => {
		const r = resolveWhen(["at", "5pm"], NOW);
		if (!("error" in r)) expect(r.dueAt.getTime()).toBe(at(17, 0).getTime());
		else throw new Error(r.error);
	});

	it("parses 'at 12am' as midnight with roll-forward", () => {
		const r = resolveWhen(["at", "12am"], NOW);
		if (!("error" in r)) expect(r.dueAt.getTime()).toBe(at(0, 0, 0, 1).getTime());
		else throw new Error(r.error);
	});

	it("parses 'at 12pm' as noon; exact-now rolls to tomorrow", () => {
		const r = resolveWhen(["at", "12pm"], NOW); // NOW is exactly 12:00 local
		if (!("error" in r)) expect(r.dueAt.getTime()).toBe(at(12, 0, 0, 1).getTime());
		else throw new Error(r.error);
	});

	it("parses 'at 9:30am'", () => {
		const r = resolveWhen(["at", "9:30am"], NOW);
		if (!("error" in r)) expect(r.dueAt.getTime()).toBe(at(9, 30, 0, 1).getTime());
		else throw new Error(r.error);
	});

	it("parses 'at 14:30:45' with seconds", () => {
		const r = resolveWhen(["at", "14:30:45"], NOW);
		if (!("error" in r)) expect(r.dueAt.getTime()).toBe(at(14, 30, 45).getTime());
		else throw new Error(r.error);
	});

	it("consumes exactly the two spec tokens", () => {
		const r = resolveWhen(["at", "14:30", "run", "it"], NOW);
		if (!("error" in r)) expect(r.consumed).toBe(2);
		else throw new Error(r.error);
	});

	it("rejects 'at 25:00'", () => {
		expect("error" in resolveWhen(["at", "25:00"], NOW)).toBe(true);
	});

	it("rejects 'at 13am'", () => {
		expect("error" in resolveWhen(["at", "13am"], NOW)).toBe(true);
	});

	it("rejects bare 'at'", () => {
		expect("error" in resolveWhen(["at"], NOW)).toBe(true);
	});
});

describe("resolveWhen: explicit dates ('at <date>')", () => {
	it("parses 'at 2025-06-03 09:00'", () => {
		const r = resolveWhen(["at", "2025-06-03", "09:00"], NOW);
		if (!("error" in r)) expect(r.dueAt.getTime()).toBe(new Date(2025, 5, 3, 9, 0).getTime());
		else throw new Error(r.error);
	});

	it("parses date-only as midnight", () => {
		const r = resolveWhen(["at", "2025-06-03"], NOW);
		if (!("error" in r)) expect(r.dueAt.getTime()).toBe(new Date(2025, 5, 3, 0, 0).getTime());
		else throw new Error(r.error);
	});

	it("rejects a past explicit date without roll-forward", () => {
		expect("error" in resolveWhen(["at", "2025-05-01"], NOW)).toBe(true);
	});

	it("rejects invalid calendar date", () => {
		expect("error" in resolveWhen(["at", "2025-13-01"], NOW)).toBe(true);
	});

	it("rejects date with invalid clock", () => {
		expect("error" in resolveWhen(["at", "2025-06-03", "25:00"], NOW)).toBe(true);
	});
});

describe("resolveWhen: tomorrow", () => {
	it("parses 'tomorrow 9am'", () => {
		const r = resolveWhen(["tomorrow", "9am"], NOW);
		if (!("error" in r)) expect(r.dueAt.getTime()).toBe(new Date(2025, 5, 2, 9, 0).getTime());
		else throw new Error(r.error);
	});

	it("parses 'tomorrow at 14:30'", () => {
		const r = resolveWhen(["tomorrow", "at", "14:30"], NOW);
		if (!("error" in r)) expect(r.dueAt.getTime()).toBe(new Date(2025, 5, 2, 14, 30).getTime());
		else throw new Error(r.error);
	});

	it("parses 'tomorrow 14:30:30' with seconds", () => {
		const r = resolveWhen(["tomorrow", "14:30:30"], NOW);
		if (!("error" in r)) expect(r.dueAt.getTime()).toBe(new Date(2025, 5, 2, 14, 30, 30).getTime());
		else throw new Error(r.error);
	});

	it("consumes exactly the spec tokens", () => {
		const r = resolveWhen(["tomorrow", "at", "9am", "ship", "it"], NOW);
		if (!("error" in r)) expect(r.consumed).toBe(3);
		else throw new Error(r.error);
	});

	it("rejects bare 'tomorrow'", () => {
		expect("error" in resolveWhen(["tomorrow"], NOW)).toBe(true);
	});

	it("rejects 'tomorrow 25:00'", () => {
		expect("error" in resolveWhen(["tomorrow", "25:00"], NOW)).toBe(true);
	});
});

describe("resolveWhen: 10-day horizon cap", () => {
	it("accepts exactly 10 days out", () => {
		const r = resolveWhen(["in", "10d"], NOW);
		if (!("error" in r)) expect(r.dueAt.getTime()).toBe(inMs(10 * DAY).getTime());
		else throw new Error(r.error);
	});

	it("rejects beyond 10 days (relative)", () => {
		expect("error" in resolveWhen(["in", "10d1h"], NOW)).toBe(true);
	});

	it("rejects beyond 10 days (absolute)", () => {
		expect("error" in resolveWhen(["at", "2025-06-15", "09:00"], NOW)).toBe(true);
	});
});

describe("resolveWhen: description", () => {
	it("describes the resolved absolute time and echoes the spec", () => {
		const r = resolveWhen(["in", "45m", "go"], NOW);
		if (!("error" in r)) {
			expect(r.description).toBe("2025-06-01 12:45");
			expect(r.timeSpecText).toBe("in 45m");
		} else throw new Error(r.error);
	});
});

describe("formatDuration", () => {
	it("formats seconds", () => {
		expect(formatDuration(30_000)).toBe("30s");
		expect(formatDuration(59_999)).toBe("59s");
	});

	it("formats minutes", () => {
		expect(formatDuration(45 * MIN)).toBe("45m");
	});

	it("formats hours and minutes", () => {
		expect(formatDuration(90 * MIN)).toBe("1h30m");
		expect(formatDuration(2 * HOUR)).toBe("2h");
	});

	it("formats days and hours", () => {
		expect(formatDuration(36 * HOUR)).toBe("1d12h");
		expect(formatDuration(10 * DAY)).toBe("10d");
	});

	it("clamps negative and zero to 0s", () => {
		expect(formatDuration(-5000)).toBe("0s");
		expect(formatDuration(0)).toBe("0s");
	});
});

describe("formatDue", () => {
	it("renders absolute time with countdown", () => {
		expect(formatDue(new Date(NOW.getTime() + 45 * MIN), NOW)).toBe("2025-06-01 12:45 (in 45m)");
	});

	it("renders overdue", () => {
		expect(formatDue(new Date(NOW.getTime() - MIN), NOW)).toBe("2025-06-01 11:59 (overdue)");
	});
});

describe("resolveWhen: relative durations", () => {
	it("parses 'in 45m'", () => {
		const r = resolveWhen(["in", "45m"], NOW);
		expect(r).not.toHaveProperty("error");
		if (!("error" in r)) expect(r.dueAt.getTime()).toBe(inMs(45 * MIN).getTime());
	});

	it("parses 'in 2h'", () => {
		const r = resolveWhen(["in", "2h"], NOW);
		if (!("error" in r)) expect(r.dueAt.getTime()).toBe(inMs(2 * HOUR).getTime());
	});

	it("parses composite 'in 1h30m'", () => {
		const r = resolveWhen(["in", "1h30m"], NOW);
		if (!("error" in r)) expect(r.dueAt.getTime()).toBe(inMs(90 * MIN).getTime());
	});

	it("parses 'in 30s'", () => {
		const r = resolveWhen(["in", "30s"], NOW);
		if (!("error" in r)) expect(r.dueAt.getTime()).toBe(inMs(30_000).getTime());
	});

	it("parses 'in 2d'", () => {
		const r = resolveWhen(["in", "2d"], NOW);
		if (!("error" in r)) expect(r.dueAt.getTime()).toBe(inMs(2 * DAY).getTime());
	});

	it("parses composite 'in 1d12h'", () => {
		const r = resolveWhen(["in", "1d12h"], NOW);
		if (!("error" in r)) expect(r.dueAt.getTime()).toBe(inMs(36 * HOUR).getTime());
	});

	it("consumes exactly the two spec tokens", () => {
		const r = resolveWhen(["in", "45m", "do", "the", "thing"], NOW);
		if (!("error" in r)) expect(r.consumed).toBe(2);
	});

	it("rejects zero duration", () => {
		const r = resolveWhen(["in", "0m"], NOW);
		expect("error" in r).toBe(true);
	});

	it("rejects missing unit", () => {
		const r = resolveWhen(["in", "45"], NOW);
		expect("error" in r).toBe(true);
	});

	it("rejects unknown unit", () => {
		const r = resolveWhen(["in", "1x"], NOW);
		expect("error" in r).toBe(true);
	});

	it("rejects spec without a prefix", () => {
		const r = resolveWhen(["45m"], NOW);
		expect("error" in r).toBe(true);
	});
});
