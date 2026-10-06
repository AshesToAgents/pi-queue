const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Max distance into the future a queue item may target. */
export const MAX_HORIZON_MS = 10 * DAY;

export interface ResolvedWhen {
	dueAt: Date;
	/** Number of leading tokens the time spec consumed. */
	consumed: number;
	/** Human-readable absolute local time, e.g. "2025-06-01 14:30". */
	description: string;
	/** Raw echo of the spec tokens, e.g. "in 45m". */
	timeSpecText: string;
}

export interface WhenError {
	error: string;
}

function parseDurationToken(token: string): number | null {
	if (!/^(?:\d+d)?(?:\d+h)?(?:\d+m)?(?:\d+s)?$/i.test(token)) return null;
	let ms = 0;
	for (const seg of token.toLowerCase().matchAll(/(\d+)([dhms])/g)) {
		const factor = { d: DAY, h: HOUR, m: MINUTE, s: SECOND }[seg[2]]!;
		ms += Number(seg[1]) * factor;
	}
	return ms;
}

/** Locale-independent "YYYY-MM-DD HH:MM" for a local Date. */
export function describeDate(d: Date): string {
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function formatDuration(ms: number): string {
	if (ms <= 0) return "0s";
	const parts: string[] = [];
	const units: Array<[number, string]> = [
		[DAY, "d"],
		[HOUR, "h"],
		[MINUTE, "m"],
		[SECOND, "s"],
	];
	let rest = Math.floor(ms);
	for (const [factor, suffix] of units) {
		const n = Math.floor(rest / factor);
		if (n > 0) parts.push(`${n}${suffix}`);
		rest -= n * factor;
	}
	return parts.length > 0 ? parts.join("") : "0s";
}

export function formatDue(dueAt: Date, now: Date): string {
	const remaining = dueAt.getTime() - now.getTime();
	const suffix = remaining > 0 ? ` (in ${formatDuration(remaining)})` : " (overdue)";
	return describeDate(dueAt) + suffix;
}

function result(dueAt: Date, consumed: number, tokens: string[]): ResolvedWhen {
	return {
		dueAt,
		consumed,
		description: describeDate(dueAt),
		timeSpecText: tokens.slice(0, consumed).join(" "),
	};
}

const CLOCK_24_RE = /^(2[0-3]|[01]?\d):([0-5]\d)(?::([0-5]\d))?$/;
const CLOCK_12_RE = /^(1[0-2]|0?[1-9])(?::([0-5]\d))?(am|pm)$/i;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

interface Clock {
	h: number;
	m: number;
	s: number;
}

function parseClock(token: string): Clock | null {
	const m12 = token.match(CLOCK_12_RE);
	if (m12) {
		let h = Number(m12[1]) % 12;
		if (m12[3].toLowerCase() === "pm") h += 12;
		return { h, m: m12[2] ? Number(m12[2]) : 0, s: 0 };
	}
	const m24 = token.match(CLOCK_24_RE);
	if (m24) return { h: Number(m24[1]), m: Number(m24[2]), s: m24[3] ? Number(m24[3]) : 0 };
	return null;
}

/** Date built on `now`'s calendar (plus dayOffset) at the given clock time. */
function atClock(now: Date, clock: Clock, dayOffset = 0): Date {
	return new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, clock.h, clock.m, clock.s, 0);
}

function finish(dueAt: Date, now: Date, consumed: number, tokens: string[]): ResolvedWhen | WhenError {
	if (dueAt.getTime() - now.getTime() > MAX_HORIZON_MS) {
		return { error: "that is more than 10 days away; queue items must fire within 10 days" };
	}
	return result(dueAt, consumed, tokens);
}

export function resolveWhen(tokens: string[], now: Date): ResolvedWhen | WhenError {
	if (tokens.length === 0) return { error: "missing time spec (use 'in <duration>', 'at <time>', or 'tomorrow <time>')" };
	const head = tokens[0].toLowerCase();

	if (head === "in") {
		if (tokens.length < 2) return { error: "'in' needs a duration, e.g. 'in 45m' or 'in 1h30m'" };
		const ms = parseDurationToken(tokens[1]);
		if (ms === null || ms <= 0) {
			return { error: `invalid duration '${tokens[1]}' (use e.g. 45m, 2h, 1h30m, 1d12h)` };
		}
		return finish(new Date(now.getTime() + ms), now, 2, tokens);
	}

	if (head === "at") {
		if (tokens.length < 2) return { error: "'at' needs a time, e.g. 'at 14:30' or 'at 2025-06-03 09:00'" };
		const dateMatch = tokens[1].match(DATE_RE);
		if (dateMatch) {
			const [y, mo, d] = [Number(dateMatch[1]), Number(dateMatch[2]), Number(dateMatch[3])];
			const clock = tokens[2] !== undefined ? parseClock(tokens[2]) : { h: 0, m: 0, s: 0 };
			if (!clock) return { error: `invalid time '${tokens[2]}' (use HH:MM, Ham, or H:MMam)` };
			const dueAt = new Date(y, mo - 1, d, clock.h, clock.m, clock.s, 0);
			if (dueAt.getMonth() !== mo - 1 || dueAt.getDate() !== d) {
				return { error: `invalid date '${tokens[1]}'` };
			}
			if (dueAt.getTime() <= now.getTime()) {
				return { error: `that time is already in the past (${result(dueAt, 0, tokens).description})` };
			}
			return finish(dueAt, now, tokens[2] !== undefined ? 3 : 2, tokens);
		}
		const clock = parseClock(tokens[1]);
		if (!clock) return { error: `invalid time '${tokens[1]}' (use HH:MM, Ham, or H:MMam)` };
		const dueAt = atClock(now, clock);
		if (dueAt.getTime() <= now.getTime()) dueAt.setDate(dueAt.getDate() + 1); // roll bare clock times to tomorrow
		return finish(dueAt, now, 2, tokens);
	}

	if (head === "tomorrow") {
		let clockToken: string | undefined;
		let consumed: number;
		if (tokens[1]?.toLowerCase() === "at") {
			clockToken = tokens[2];
			consumed = 3;
		} else {
			clockToken = tokens[1];
			consumed = 2;
		}
		const clock = clockToken !== undefined ? parseClock(clockToken) : null;
		if (!clock) return { error: "'tomorrow' needs a time, e.g. 'tomorrow 9am' or 'tomorrow at 14:30'" };
		return finish(atClock(now, clock, 1), now, consumed, tokens);
	}

	return { error: "time spec must start with 'in', 'at', or 'tomorrow'" };
}
