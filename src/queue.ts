import { resolveWhen, describeDate } from "./time.js";

export const QUEUE_CUSTOM_TYPE = "pi-queue:state";

export interface QueueItem {
	id: string;
	prompt: string;
	/** ISO timestamp of when the prompt should fire. */
	dueAt: string;
	/** ISO timestamp of when the item was created. */
	createdAt: string;
}

export type QueueCommand =
	| { kind: "list" }
	| { kind: "clear" }
	| { kind: "cancel"; id: string }
	| { kind: "add"; dueAt: Date; prompt: string; description: string; timeSpecText: string }
	| { kind: "error"; message: string };

export function parseCommand(args: string, now: Date): QueueCommand {
	const tokens = args.trim().split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return { kind: "list" };

	const head = tokens[0].toLowerCase();
	if (head === "list") return { kind: "list" };
	if (head === "clear") return { kind: "clear" };
	if (head === "cancel") {
		if (tokens.length !== 2) return { kind: "error", message: "usage: /queue cancel <id> (see /queue for ids)" };
		return { kind: "cancel", id: tokens[1] };
	}

	const when = resolveWhen(tokens, now);
	if ("error" in when) return { kind: "error", message: when.error };
	const prompt = tokens.slice(when.consumed).join(" ");
	if (!prompt) return { kind: "error", message: "no prompt given after the time spec" };
	return {
		kind: "add",
		dueAt: when.dueAt,
		prompt,
		description: when.description,
		timeSpecText: when.timeSpecText,
	};
}

export function makeItem(prompt: string, dueAt: Date, now: Date): QueueItem {
	return {
		id: makeId(),
		prompt,
		dueAt: dueAt.toISOString(),
		createdAt: now.toISOString(),
	};
}

function makeId(): string {
	let id = "";
	for (let i = 0; i < 6; i++) {
		id += Math.floor(Math.random() * 36).toString(36);
	}
	return id;
}

/** Items from the most recent queue snapshot entry on the current branch, or null. */
export function latestQueueData(entries: unknown[]): QueueItem[] | null {
	let items: QueueItem[] | null = null;
	for (const entry of entries) {
		if (
			entry &&
			typeof entry === "object" &&
			(entry as { type?: string }).type === "custom" &&
			(entry as { customType?: string }).customType === QUEUE_CUSTOM_TYPE
		) {
			const data = (entry as { data?: { items?: QueueItem[] } }).data;
			if (data && Array.isArray(data.items)) items = data.items;
		}
	}
	return items;
}
