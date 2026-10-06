# pi-queue

A [pi](https://github.com/earendil-works/pi) extension that adds a `/queue` command for scheduling a prompt to be sent to the current session at a future time — for example when usage limits are about to reset.

## Install

```bash
# Global (user-level)
pi install ssh://git@github.com/AshesToAgents/pi-queue.git

# Project-level (shared with team via .pi/settings.json)
pi install -l ssh://git@github.com/AshesToAgents/pi-queue.git

# Try without installing
pi -e ssh://git@github.com/AshesToAgents/pi-queue.git
```

## What's Included

| Type | Name | Description |
|------|------|-------------|
| Extension | — | Fires queued prompts as real agent turns at their scheduled time |
| Command | `/queue` | Enqueue, list, cancel, and clear scheduled prompts |

## Usage

### `/queue`

Queue a prompt for a future time. The prompt is sent as a real user message when the time comes, starting a normal agent turn.

```
/queue <time> <prompt>
```

Time specs:

| Form | Examples | Meaning |
|------|----------|---------|
| Relative | `in 45m`, `in 2h`, `in 1h30m`, `in 1d12h` | Now plus the duration |
| Absolute clock | `at 14:30`, `at 9am`, `at 5pm`, `at 14:30:45` | Today at that time (rolls to tomorrow if already past) |
| Date and clock | `at 2025-06-03 09:00` | That exact time (past dates are rejected) |
| Tomorrow | `tomorrow 9am`, `tomorrow at 14:30` | Tomorrow at that time |

Manage the queue:

| Command | Description |
|---------|-------------|
| `/queue` or `/queue list` | Show pending items with ids, due times, and countdowns |
| `/queue cancel <id>` | Remove one item |
| `/queue clear` | Remove all items |

```
> /queue in 4h continue the rate-limit refactor
Queued [k3x9f2] for 2025-06-01 16:00 (in 4h) (cancel: /queue cancel k3x9f2)
```

## How It Works

- Queue items are persisted as custom session entries (excluded from model context), one full snapshot per mutation. On session start the latest snapshot on the current branch is restored, so queued prompts survive restarts.
- Items that are already overdue when a session resumes fire ~1.5s after startup.
- Each item is armed with a timer; when it fires, the item is removed and persisted first, then the prompt is sent with `deliverAs: "followUp"` so it queues behind a running turn instead of steering it.
- Items must fire within 10 days of scheduling; longer horizons are rejected.

## Development

```bash
npm install
npm run typecheck
npm test
```

## License

MIT
