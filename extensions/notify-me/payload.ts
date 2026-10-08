import type { SettledOutcome } from "./adapter.js";
import type { PendingNotification } from "./pending.js";

export interface HandbackSnapshot {
  readonly message: string;
  readonly cwd: string;
  readonly sessionName?: string;
  readonly elapsedMs: number;
  readonly timestamp: string;
  readonly status: SettledOutcome["status"];
  readonly errorReason?: string;
}

export interface DiscordPayload {
  readonly allowed_mentions: {
    readonly parse: readonly string[];
    readonly users: readonly string[];
    readonly roles: readonly string[];
    readonly replied_user: false;
  };
  readonly embeds: readonly {
    readonly title: string;
    readonly description: string;
    readonly color: number;
    readonly timestamp: string;
    readonly fields: readonly {
      readonly name: string;
      readonly value: string;
      readonly inline: boolean;
    }[];
  }[];
}

/** Redact before budgeting, including secrets pasted into message/cwd/name. */
function sanitize(value: string, webhookUrl: string): string {
  const token = webhookUrl.slice(webhookUrl.lastIndexOf("/") + 1);
  return (
    value
      .split("")
      .filter((character) => {
        const code = character.charCodeAt(0);
        return (
          code === 9 ||
          code === 10 ||
          code === 13 ||
          (code >= 32 && code !== 127)
        );
      })
      .join("")
      .split(webhookUrl)
      .join("[redacted]")
      .split(token)
      .join("[redacted]")
      .replace(
        /https:\/\/(?:discord\.com|discordapp\.com)\/api\/(?:v\d+\/)?webhooks\/[^\s]+/gi,
        "[redacted]",
      )
      // Replace lone surrogates; valid supplementary code points remain intact.
      .replace(/[\ud800-\udbff][\udc00-\udfff]|[\ud800-\udfff]/g, (part) =>
        part.length === 2 ? part : "\ufffd",
      )
  );
}

/** Plain-data capture only: no transcript, response, context object or credential. */
export function captureHandback(
  pending: PendingNotification,
  outcome: SettledOutcome,
  context: { cwd: string; sessionName?: string },
  now: number,
): HandbackSnapshot {
  const clean = (value: string) => sanitize(value, pending.webhookUrl);
  const firstLine = outcome.errorReason
    ?.split(/[\r\n\u2028\u2029]/)
    .find((line) => line.trim());
  const reason =
    firstLine && !/^\s*at\s/.test(firstLine)
      ? clean(firstLine).trim()
      : undefined;
  return Object.freeze({
    message: clean(pending.message),
    cwd: clean(context.cwd),
    sessionName: context.sessionName ? clean(context.sessionName) : undefined,
    elapsedMs: Math.max(0, now - pending.armedAt),
    timestamp: new Date(now).toISOString(),
    status: outcome.status,
    errorReason:
      outcome.status === "error" ? reason || "Reason unavailable." : undefined,
  });
}

/** Conservative UTF-16 budget (also bounds code-point counts), never splits a pair. */
export function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value;
  let end = limit - 1;
  if (end > 0 && /[\ud800-\udbff]/.test(value[end - 1])) --end;
  return `${value.slice(0, end)}…`;
}

function elapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours
    ? `${hours}h ${minutes}m ${seconds % 60}s`
    : minutes
      ? `${minutes}m ${seconds % 60}s`
      : `${seconds}s`;
}

export function renderPayload(snapshot: HandbackSnapshot): DiscordPayload {
  // Reserved per-category budgets total < 6000 including title and field names.
  // Discord permits description 4096, field value 1024, name/title 256, 25 fields.
  const fields = [
    {
      name: "Working directory",
      value: truncate(snapshot.cwd || "Unavailable", 1024),
      inline: false,
    },
    {
      name: "Elapsed since arming",
      value: truncate(elapsed(snapshot.elapsedMs), 64),
      inline: true,
    },
  ];
  if (snapshot.sessionName)
    fields.push({
      name: "Session",
      value: truncate(snapshot.sessionName, 1024),
      inline: true,
    });
  if (snapshot.status === "error")
    fields.push({
      name: "Error reason",
      value: truncate(snapshot.errorReason || "Reason unavailable.", 512),
      inline: false,
    });
  return Object.freeze({
    allowed_mentions: Object.freeze({
      parse: Object.freeze([]),
      users: Object.freeze([]),
      roles: Object.freeze([]),
      replied_user: false as const,
    }),
    embeds: Object.freeze([
      Object.freeze({
        title: snapshot.status === "error" ? "Agent errored" : "Agent finished",
        description: truncate(snapshot.message || "Reminder", 3000),
        color: snapshot.status === "error" ? 0xed4245 : 0x57f287,
        timestamp: snapshot.timestamp,
        fields: Object.freeze(fields.map((field) => Object.freeze(field))),
      }),
    ]),
  });
}
