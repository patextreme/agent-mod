import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type NotifyMeDependencies, registerNotifyMe } from "./adapter.js";
import {
  DELIVERY_WARNING,
  type DeliveryDependencies,
  DeliveryJobs,
  shutdownDeliveryJobs,
} from "./delivery.js";
import { captureHandback, renderPayload } from "./payload.js";

export type RuntimeDependencies = DeliveryDependencies &
  Pick<NotifyMeDependencies, "loadConfiguration" | "now">;

/** Public integration seam permits model/network-free lifecycle tests. */
export function installNotifyMe(
  pi: Pick<ExtensionAPI, "on" | "registerCommand" | "getSessionName">,
  dependencies: RuntimeDependencies = {},
): void {
  const jobs = new DeliveryJobs(dependencies);
  const now = dependencies.now ?? Date.now;
  let sessionGeneration = 0;
  pi.on("session_start", () => {
    ++sessionGeneration;
  });
  pi.on("session_shutdown", (event) => {
    ++sessionGeneration;
    // Session replacement clears pending state/UI ownership, not dispatched jobs.
    // Reload tears down this extension runtime and must release its resources.
    if (event.reason === "quit" || event.reason === "reload")
      shutdownDeliveryJobs();
  });
  registerNotifyMe(pi, {
    loadConfiguration: dependencies.loadConfiguration,
    now,
    onHandback(pending, outcome, ctx) {
      const generation = sessionGeneration;
      const snapshot = captureHandback(
        pending,
        outcome,
        { cwd: ctx.cwd, sessionName: pi.getSessionName() },
        now(),
      );
      const hasUI = ctx.hasUI;
      const notify = ctx.ui.notify.bind(ctx.ui);
      jobs.dispatch(pending.webhookUrl, renderPayload(snapshot), () => {
        // Never report an outgoing session's delivery failure in a new session.
        if (generation === sessionGeneration && hasUI)
          notify(DELIVERY_WARNING, "warning");
      });
    },
  });
}

export default function notifyMe(pi: ExtensionAPI): void {
  installNotifyMe(pi);
}
