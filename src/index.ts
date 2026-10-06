import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { QUEUE_CUSTOM_TYPE, latestQueueData, makeItem, parseCommand } from "./queue.js";
import type { QueueItem } from "./queue.js";
import { QueueScheduler } from "./scheduler.js";
import { formatDue } from "./time.js";

const PROMPT_PREVIEW_LENGTH = 60;

function truncate(text: string, max = PROMPT_PREVIEW_LENGTH): string {
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export default function queueExtension(pi: ExtensionAPI) {
	let scheduler: QueueScheduler | null = null;

	const ensureScheduler = (): QueueScheduler => {
		if (scheduler) return scheduler;
		scheduler = new QueueScheduler({
			send: (prompt) => pi.sendUserMessage(prompt, { deliverAs: "followUp" }),
			persist: (items) => pi.appendEntry(QUEUE_CUSTOM_TYPE, { items }),
		});
		return scheduler;
	};

	pi.on("session_start", async (_event, ctx) => {
		const items = latestQueueData(ctx.sessionManager.getEntries()) ?? [];
		ensureScheduler().load(items);
	});

	pi.on("session_shutdown", async () => {
		scheduler?.dispose();
		scheduler = null;
	});

	pi.registerCommand("queue", {
		description: "Queue a prompt for a future time: /queue in 45m <prompt>, /queue at 14:30 <prompt>, /queue tomorrow 9am <prompt>; /queue to list",
		handler: async (args, ctx) => {
			const now = new Date();
			const cmd = parseCommand(args, now);
			const s = ensureScheduler();

			switch (cmd.kind) {
				case "error":
					ctx.ui.notify(cmd.message, "warning");
					return;

				case "list": {
					const items: QueueItem[] = s.snapshot();
					if (items.length === 0) {
						ctx.ui.notify("Queue is empty", "info");
						return;
					}
					const lines = items.map((item) => {
						const due = formatDue(new Date(item.dueAt), now);
						return `[${item.id}] ${due} — ${truncate(item.prompt)}`;
					});
					ctx.ui.notify(`${items.length} queued:\n${lines.join("\n")}`, "info");
					return;
				}

				case "add": {
					const item = makeItem(cmd.prompt, cmd.dueAt, now);
					s.add(item);
					ctx.ui.notify(`Queued [${item.id}] for ${formatDue(cmd.dueAt, now)} (cancel: /queue cancel ${item.id})`, "info");
					return;
				}

				case "cancel": {
					const ok = s.cancel(cmd.id);
					ctx.ui.notify(ok ? `Removed [${cmd.id}]` : `No queued item '${cmd.id}'`, ok ? "info" : "warning");
					return;
				}

				case "clear": {
					const count = s.snapshot().length;
					s.clear();
					ctx.ui.notify(`Cleared ${count} item${count === 1 ? "" : "s"}`, "info");
					return;
				}
			}
		},
	});
}
