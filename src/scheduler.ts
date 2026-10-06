import type { QueueItem } from "./queue.js";

/** Delay before an overdue item fires after being loaded at session start. */
export const RESUME_GRACE_MS = 1500;

export interface SchedulerDeps {
	send(prompt: string): void;
	persist(items: QueueItem[]): void;
}

/**
 * Owns the pending queue items and their timers.
 * All mutations append a fresh snapshot via `persist`; firing removes the item
 * before sending so a crash between the two can only re-fire, never lose, a prompt.
 */
export class QueueScheduler {
	private items: QueueItem[] = [];
	private timers = new Map<string, ReturnType<typeof setTimeout>>();

	constructor(private deps: SchedulerDeps) {}

	snapshot(): QueueItem[] {
		return [...this.items];
	}

	add(item: QueueItem): void {
		this.items.push(item);
		this.sort();
		this.persist();
		this.arm(item);
	}

	cancel(id: string): boolean {
		if (!this.items.some((item) => item.id === id)) return false;
		this.clearTimer(id);
		this.items = this.items.filter((item) => item.id !== id);
		this.persist();
		return true;
	}

	clear(): void {
		for (const id of this.timers.keys()) this.clearTimer(id);
		this.items = [];
		this.persist();
	}

	/** Replace state (session start / resume) without persisting. */
	load(items: QueueItem[]): void {
		for (const id of this.timers.keys()) this.clearTimer(id);
		this.items = [...items].sort((a, b) => a.dueAt.localeCompare(b.dueAt));
		for (const item of this.items) this.arm(item);
	}

	dispose(): void {
		for (const id of this.timers.keys()) this.clearTimer(id);
	}

	private sort(): void {
		this.items.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
	}

	private arm(item: QueueItem): void {
		const delay = new Date(item.dueAt).getTime() - Date.now();
		// Items that are already due (e.g. overdue on resume) fire after a short
		// grace so the session UI is ready; same-delay timers fire in insertion
		// order, which is due order because items are sorted.
		const effective = delay <= 0 ? RESUME_GRACE_MS : delay;
		const timer = setTimeout(() => this.fire(item.id), effective);
		this.timers.set(item.id, timer);
	}

	private fire(id: string): void {
		const item = this.items.find((i) => i.id === id);
		if (!item) return;
		this.timers.delete(id);
		this.items = this.items.filter((i) => i.id !== id);
		this.persist();
		this.deps.send(item.prompt);
	}

	private persist(): void {
		this.deps.persist([...this.items]);
	}

	private clearTimer(id: string): void {
		const timer = this.timers.get(id);
		if (timer !== undefined) clearTimeout(timer);
		this.timers.delete(id);
	}
}
