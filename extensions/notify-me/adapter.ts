import type {
  AgentActivityOutcome,
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { type ConfigurationResult, loadConfiguration } from "./config.js";
import { type PendingNotification, PendingNotifications } from "./pending.js";

export interface SettledOutcome {
  readonly status: "completed" | "error";
  readonly errorReason?: string;
}

export interface NotifyMeDependencies {
  loadConfiguration?: () => Promise<ConfigurationResult>;
  now?: () => number;
  // The delivery integration must snapshot context synchronously and launch its
  // independent job without awaiting HTTP/retries. It is supplied by the entrypoint.
  onHandback: (
    pending: PendingNotification,
    outcome: SettledOutcome,
    ctx: ExtensionContext,
  ) => void;
}

function redactReason(
  reason: string | undefined,
  webhookUrl: string,
): string | undefined {
  if (!reason) return undefined;
  const token = webhookUrl.slice(webhookUrl.lastIndexOf("/") + 1);
  return reason
    .split(webhookUrl)
    .join("[redacted]")
    .split(token)
    .join("[redacted]")
    .replace(
      /https:\/\/(?:discord\.com|discordapp\.com)\/api\/(?:v\d+\/)?webhooks\/[^\s]+/gi,
      "[redacted]",
    );
}

/** Actual Pi registrations, with configuration/clock/handback ports for testing. */
export function registerNotifyMe(
  pi: Pick<ExtensionAPI, "on" | "registerCommand">,
  dependencies: NotifyMeDependencies,
): void {
  const pending = new PendingNotifications();
  const readConfiguration = dependencies.loadConfiguration ?? loadConfiguration;
  const now = dependencies.now ?? Date.now;
  let outcome: AgentActivityOutcome = "completed";
  let errorReason: string | undefined;

  const resetOutcome = () => {
    outcome = "completed";
    errorReason = undefined;
  };

  pi.registerCommand("notify-me", {
    description:
      "Arm a one-shot Discord notification: /notify-me <message> or cancel",
    handler: async (args, ctx) => {
      const message = args.trim();
      if (!message) {
        ctx.ui.notify(
          "Usage: /notify-me <message> | /notify-me cancel",
          "info",
        );
        return;
      }
      if (message === "cancel") {
        pending.clear();
        ctx.ui.notify("Pending notification canceled.", "info");
        return;
      }
      const generation = pending.beginArm();
      let configuration: ConfigurationResult;
      try {
        configuration = await readConfiguration();
      } catch {
        configuration = {
          ok: false,
          diagnostic:
            "Cannot load notify-me configuration. Check ~/.pi/notify-me.json and its private credential file.",
        };
      }
      // Superseded reads must neither arm nor notify an obsolete session/UI.
      if (!pending.isCurrent(generation)) return;
      if (!configuration.ok) {
        ctx.ui.notify(configuration.diagnostic, "warning");
        return;
      }
      if (pending.arm(generation, message, configuration.webhookUrl, now())) {
        ctx.ui.notify(
          "Notification armed for the next final handback.",
          "info",
        );
      }
    },
  });

  pi.on("session_start", () => {
    pending.resetSession();
    resetOutcome();
  });
  pi.on("session_shutdown", () => {
    // Pending work belongs to the outgoing session. Dispatched jobs do not;
    // their shutdown-vs-replacement policy belongs to the delivery integration.
    pending.resetSession();
    resetOutcome();
  });
  pi.on("agent_start", resetOutcome);
  pi.on("message_end", (event) => {
    if (event.message.role !== "assistant") return;
    outcome =
      event.message.stopReason === "error"
        ? "error"
        : event.message.stopReason === "aborted"
          ? "aborted"
          : "completed";
    errorReason = outcome === "error" ? event.message.errorMessage : undefined;
  });
  pi.on("agent_before_settle", (event) => {
    outcome = event.outcome;
    if (outcome !== "error") errorReason = undefined;
  });
  pi.on("agent_settled", (event, ctx) => {
    const notification = pending.take();
    const settledOutcome = outcome;
    const reason = errorReason;
    resetOutcome();
    if (!notification || event.aborted || settledOutcome === "aborted") return;
    dependencies.onHandback(
      notification,
      Object.freeze({
        status: settledOutcome === "error" ? "error" : "completed",
        errorReason:
          settledOutcome === "error"
            ? redactReason(reason, notification.webhookUrl)
            : undefined,
      }),
      ctx,
    );
  });
}
