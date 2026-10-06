import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueueScheduler, RESUME_GRACE_MS } from "./scheduler.js";
import type { QueueItem } from "./queue.js";

function makeItem(overrides: Partial<QueueItem> & Pick<QueueItem, "id" | "prompt" | "dueAt">): QueueItem {
	return { createdAt: new Date().toISOString(), ...overrides };
}

describe("QueueScheduler", () => {
	let sent: string[];
	let persisted: QueueItem[][];
	let scheduler: QueueScheduler;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2025-06-01T12:00:00"));
		sent = [];
		persisted = [];
		scheduler = new QueueScheduler({
			send: (prompt) => sent.push(prompt),
			persist: (items) => persisted.push([...items]),
		});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	const futureItem = (seconds: number) =>
		makeItem({ id: `id${seconds}`, prompt: `p${seconds}`, dueAt: new Date(Date.now() + seconds * 1000).toISOString() });

	it("add persists a snapshot and fires at the due time", () => {
		const item = futureItem(10);
		scheduler.add(item);
		expect(persisted).toEqual([[item]]);

		vi.advanceTimersByTime(10_000);
		expect(sent).toEqual(["p10"]);
		expect(persisted.at(-1)).toEqual([]);
		expect(scheduler.snapshot()).toEqual([]);
	});

	it("cancel removes the item, disarms its timer, and persists", () => {
		const item = futureItem(10);
		scheduler.add(item);
		expect(scheduler.cancel(item.id)).toBe(true);

		vi.advanceTimersByTime(60_000);
		expect(sent).toEqual([]);
		expect(persisted.at(-1)).toEqual([]);
	});

	it("cancel of an unknown id returns false without persisting", () => {
		scheduler.add(futureItem(10));
		const before = persisted.length;
		expect(scheduler.cancel("nope")).toBe(false);
		expect(persisted.length).toBe(before);
	});

	it("clear disarms everything", () => {
		scheduler.add(futureItem(10));
		scheduler.add(futureItem(20));
		scheduler.clear();

		vi.advanceTimersByTime(120_000);
		expect(sent).toEqual([]);
		expect(scheduler.snapshot()).toEqual([]);
		expect(persisted.at(-1)).toEqual([]);
	});

	it("load arms future items without persisting", () => {
		const item = futureItem(30);
		scheduler.load([item]);
		expect(persisted).toEqual([]);

		vi.advanceTimersByTime(29_999);
		expect(sent).toEqual([]);
		vi.advanceTimersByTime(1);
		expect(sent).toEqual(["p30"]);
	});

	it("load fires overdue items after a grace delay, in due order", () => {
		const older = makeItem({ id: "older", prompt: "older", dueAt: new Date(Date.now() - 2000).toISOString() });
		const newer = makeItem({ id: "newer", prompt: "newer", dueAt: new Date(Date.now() - 1000).toISOString() });
		scheduler.load([newer, older]);

		vi.advanceTimersByTime(RESUME_GRACE_MS - 1);
		expect(sent).toEqual([]);
		vi.advanceTimersByTime(1);
		expect(sent).toEqual(["older", "newer"]);
		expect(persisted.at(-1)).toEqual([]);
	});

	it("dispose stops all timers without firing", () => {
		scheduler.add(futureItem(10));
		scheduler.load([makeItem({ id: "overdue", prompt: "x", dueAt: new Date(Date.now() - 1000).toISOString() })]);
		scheduler.dispose();

		vi.advanceTimersByTime(600_000);
		expect(sent).toEqual([]);
	});
});
