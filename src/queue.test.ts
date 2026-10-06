import { describe, it, expect } from "vitest";
import { parseCommand, latestQueueData, makeItem, QUEUE_CUSTOM_TYPE } from "./queue.js";

const NOW = new Date("2025-06-01T12:00:00");

describe("parseCommand", () => {
	it("empty args mean list", () => {
		expect(parseCommand("", NOW)).toEqual({ kind: "list" });
	});

	it("'list' means list", () => {
		expect(parseCommand("list", NOW)).toEqual({ kind: "list" });
	});

	it("'clear' means clear", () => {
		expect(parseCommand("clear", NOW)).toEqual({ kind: "clear" });
	});

	it("'cancel <id>' parses", () => {
		expect(parseCommand("cancel abc123", NOW)).toEqual({ kind: "cancel", id: "abc123" });
	});

	it("bare 'cancel' is an error", () => {
		const r = parseCommand("cancel", NOW);
		expect(r.kind).toBe("error");
	});

	it("'cancel' with extra tokens is an error", () => {
		const r = parseCommand("cancel a b", NOW);
		expect(r.kind).toBe("error");
	});

	it("subcommands are case-insensitive", () => {
		expect(parseCommand("LIST", NOW)).toEqual({ kind: "list" });
	});

	it("add with relative time and prompt", () => {
		const r = parseCommand("in 45m do the thing", NOW);
		expect(r).toMatchObject({
			kind: "add",
			prompt: "do the thing",
			timeSpecText: "in 45m",
		});
		if (r.kind === "add") expect(r.dueAt.getTime()).toBe(NOW.getTime() + 45 * 60_000);
	});

	it("add with absolute date-time (3 spec tokens)", () => {
		const r = parseCommand("at 2025-06-03 09:00 migrate the db", NOW);
		expect(r).toMatchObject({ kind: "add", prompt: "migrate the db" });
	});

	it("add with 'tomorrow at' (3 spec tokens)", () => {
		const r = parseCommand("tomorrow at 9am start the deploy", NOW);
		expect(r).toMatchObject({ kind: "add", prompt: "start the deploy", timeSpecText: "tomorrow at 9am" });
	});

	it("add without a prompt is an error", () => {
		const r = parseCommand("in 45m", NOW);
		expect(r.kind).toBe("error");
	});

	it("invalid time spec surfaces the resolver error", () => {
		const r = parseCommand("bogus 45m x", NOW);
		expect(r.kind).toBe("error");
	});

	it("whitespace is normalized in the prompt", () => {
		const r = parseCommand("in  45m   hello   there ", NOW);
		expect(r).toMatchObject({ kind: "add", prompt: "hello there" });
	});
});

describe("makeItem", () => {
	it("creates an item with id and ISO timestamps", () => {
		const dueAt = new Date(NOW.getTime() + 60_000);
		const item = makeItem("hello", dueAt, NOW);
		expect(item.prompt).toBe("hello");
		expect(item.dueAt).toBe(dueAt.toISOString());
		expect(item.createdAt).toBe(NOW.toISOString());
		expect(item.id).toMatch(/^[a-z0-9]{6}$/);
	});

	it("ids differ across calls", () => {
		const a = makeItem("x", new Date(NOW.getTime() + 1), NOW);
		const b = makeItem("y", new Date(NOW.getTime() + 2), NOW);
		expect(a.id).not.toBe(b.id);
	});
});

describe("latestQueueData", () => {
	const entries = [
		{ type: "custom", customType: "other", data: {} },
		{ type: "custom", customType: QUEUE_CUSTOM_TYPE, data: { items: [{ id: "aaa111" }] } },
		{ type: "custom", customType: QUEUE_CUSTOM_TYPE, data: { items: [{ id: "aaa111" }, { id: "bbb222" }] } },
	];

	it("returns the last queue snapshot on the branch", () => {
		const items = latestQueueData(entries as never);
		expect(items).toEqual([{ id: "aaa111" }, { id: "bbb222" }]);
	});

	it("returns null when no queue snapshot exists", () => {
		expect(latestQueueData([{ type: "custom", customType: "other", data: {} }] as never)).toBeNull();
	});

	it("tolerates a snapshot without items", () => {
		expect(latestQueueData([{ type: "custom", customType: QUEUE_CUSTOM_TYPE }] as never)).toBeNull();
	});
});
