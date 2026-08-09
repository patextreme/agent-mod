/**
 * orchestrator.ts — The blocking full-screen AgentFlow Orchestrator.
 *
 * In TUI mode a flow run is owned by a modal `ctx.ui.custom()` component: a
 * live FleetView of `main` + each running flow-agent, a streamed `af.log`
 * pane, tap-in (view live conversation, steer, stop), and one selected agent
 * at a time. The editor is restored when the run completes.
 *
 * In non-TUI modes the flow runs without the interactive Orchestrator and the
 * result is still delivered (see `runNonTuiFlow`).
 */

import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  Input,
  isKeyRelease,
  matchesKey,
  type TUI,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import type {
  FlowAgentRecord,
  FlowRunner,
  FlowRunnerEvent,
} from "./runtime.js";

// ─── Utilities ─────────────────────────────────────────────────────────────

/** `11s` — integer seconds, no decimal. */
function fmtElapsed(startedAt: number, completedAt?: number): string {
  const ms = Math.max(0, (completedAt ?? Date.now()) - startedAt);
  return `${Math.round(ms / 1000)}s`;
}

function statusIcon(status: FlowAgentRecord["status"], theme: Theme): string {
  switch (status) {
    case "running":
      return theme.fg("accent", "●");
    case "idle":
      return theme.fg("dim", "○");
    case "stopped":
      return theme.fg("warning", "■");
    case "error":
      return theme.fg("error", "✗");
    default:
      return theme.fg("dim", "○");
  }
}

function statusLabel(status: FlowAgentRecord["status"]): string {
  switch (status) {
    case "running":
      return "running";
    case "idle":
      return "idle";
    case "stopped":
      return "stopped";
    case "error":
      return "error";
    default:
      return "created";
  }
}

function rightAlign(left: string, right: string, width: number): string {
  const rightW = visibleWidth(right);
  const maxLeft = Math.max(0, width - rightW - 1);
  const leftClamped = truncateToWidth(left, maxLeft);
  const gap = Math.max(1, width - visibleWidth(leftClamped) - rightW);
  return truncateToWidth(leftClamped + " ".repeat(gap) + right, width);
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (c && typeof c === "object" && "text" in (c as object)) {
          return (c as { text: string }).text;
        }
        return "";
      })
      .join("");
  }
  return "";
}

// ─── ConversationViewer ────────────────────────────────────────────────────

const VIEWER_HEIGHT_PCT = 70;

/** Live, auto-updating conversation viewer for one flow-agent. */
export class ConversationViewer implements Component {
  private scrollOffset = 0;
  private autoScroll = true;
  private lastInnerW = 0;
  private closed = false;
  private stopArmed = false;
  private composer: Input | undefined;
  private unsubscribe: (() => void) | undefined;

  constructor(
    private tui: TUI,
    private record: FlowAgentRecord,
    private theme: Theme,
    private done: () => void,
    private onStop?: () => void,
    private onSteer?: (message: string) => void,
  ) {
    this.unsubscribe = record.session.subscribe(() => {
      if (!this.closed) this.tui.requestRender();
    });
  }

  handleInput(data: string): void {
    if (this.composer) {
      this.composer.handleInput(data);
      this.tui.requestRender();
      return;
    }
    if (matchesKey(data, "escape") || matchesKey(data, "q")) {
      this.close();
      return;
    }
    if (matchesKey(data, "enter") && this.canSteer()) {
      this.stopArmed = false;
      this.openComposer();
      return;
    }
    if (matchesKey(data, "x")) {
      if (this.isStoppable()) {
        if (this.stopArmed) {
          this.stopArmed = false;
          this.onStop?.();
        } else {
          this.stopArmed = true;
        }
        this.tui.requestRender();
      }
      return;
    }
    if (this.stopArmed) this.stopArmed = false;

    const totalLines = this.buildContentLines(this.lastInnerW).length;
    const viewport = this.viewportHeight();
    const maxScroll = Math.max(0, totalLines - viewport);

    if (matchesKey(data, "up")) {
      this.scrollOffset = Math.max(0, this.scrollOffset - 1);
      this.autoScroll = this.scrollOffset >= maxScroll;
    } else if (matchesKey(data, "down")) {
      this.scrollOffset = Math.min(maxScroll, this.scrollOffset + 1);
      this.autoScroll = this.scrollOffset >= maxScroll;
    } else if (matchesKey(data, "pageUp")) {
      this.scrollOffset = Math.max(0, this.scrollOffset - viewport);
      this.autoScroll = false;
    } else if (matchesKey(data, "pageDown")) {
      this.scrollOffset = Math.min(maxScroll, this.scrollOffset + viewport);
      this.autoScroll = this.scrollOffset >= maxScroll;
    } else if (matchesKey(data, "home")) {
      this.scrollOffset = 0;
      this.autoScroll = false;
    } else if (matchesKey(data, "end")) {
      this.scrollOffset = maxScroll;
      this.autoScroll = true;
    }
  }

  render(width: number): string[] {
    const th = this.theme;
    const innerW = Math.max(1, width - 4);
    this.lastInnerW = innerW;
    const lines: string[] = [];
    const row = (content: string) => {
      const clipped = truncateToWidth(content, innerW);
      return (
        th.fg("border", "│") +
        " " +
        clipped +
        " ".repeat(Math.max(0, innerW - visibleWidth(clipped))) +
        " " +
        th.fg("border", "│")
      );
    };
    const top = th.fg("border", `╭${"─".repeat(Math.max(0, width - 2))}╮`);
    const bottom = th.fg("border", `╰${"─".repeat(Math.max(0, width - 2))}╯`);
    const mid = row(th.fg("dim", "─".repeat(innerW)));

    lines.push(top);
    const r = this.record;
    lines.push(
      row(
        `${statusIcon(r.status, th)} ${th.bold(r.name)}  ${th.fg("muted", statusLabel(r.status))} · ${th.fg("dim", r.model ?? "inherit model")} · ${fmtElapsed(r.startedAt, r.completedAt)}`,
      ),
    );
    lines.push(mid);

    const content = this.buildContentLines(innerW);
    const viewport = this.viewportHeight();
    const maxScroll = Math.max(0, content.length - viewport);
    if (this.autoScroll) this.scrollOffset = maxScroll;
    const visibleStart = Math.min(this.scrollOffset, maxScroll);
    for (let i = 0; i < viewport; i++)
      lines.push(row(content[visibleStart + i] ?? ""));

    lines.push(mid);
    if (this.composer) {
      lines.push(row(this.composer.render(innerW)[0] ?? ""));
      lines.push(row(th.fg("dim", "Enter send · Esc cancel")));
    } else {
      const left: string[] = [];
      if (this.canSteer()) left.push(th.fg("dim", "Enter steer"));
      if (this.isStoppable()) {
        left.push(
          this.stopArmed
            ? th.fg("error", "x again to STOP")
            : th.fg("dim", "x stop"),
        );
      }
      const rightHint = th.fg("dim", "↑↓ scroll · PgUp/PgDn · Esc close");
      lines.push(
        row(
          left.join(" · ") +
            " ".repeat(
              Math.max(
                1,
                innerW -
                  visibleWidth(left.join(" · ")) -
                  visibleWidth(rightHint),
              ),
            ) +
            rightHint,
        ),
      );
    }
    lines.push(bottom);
    return lines;
  }

  invalidate(): void {
    /* nothing cached */
  }

  dispose(): void {
    this.closed = true;
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
  }

  private close(): void {
    if (this.closed) return;
    this.closed = true;
    this.done();
  }

  private isStoppable(): boolean {
    return (
      !!this.onStop &&
      (this.record.status === "running" || this.record.status === "created")
    );
  }

  /** Whether a steering composer can be opened right now. */
  canSteer(): boolean {
    return (
      !!this.onSteer &&
      (this.record.status === "running" || this.record.status === "created")
    );
  }

  /** Open the steering composer (used by `s` from the roster). */
  openComposer(): void {
    const input = new Input();
    input.focused = true;
    input.onSubmit = (value: string) => {
      const message = value.trim();
      this.composer = undefined;
      if (message) this.onSteer?.(message);
      this.tui.requestRender();
    };
    input.onEscape = () => {
      this.composer = undefined;
      this.tui.requestRender();
    };
    this.composer = input;
    this.tui.requestRender();
  }

  private viewportHeight(): number {
    const maxRows = Math.floor(
      (this.tui.terminal.rows * VIEWER_HEIGHT_PCT) / 100,
    );
    return Math.max(3, maxRows - 6);
  }

  private buildContentLines(width: number): string[] {
    const th = this.theme;
    const messages = this.record.session.messages;
    const out: string[] = [];
    if (messages.length === 0) {
      out.push(th.fg("dim", "(waiting for first message...)"));
      return out;
    }
    let sep = false;
    for (const msg of messages) {
      if (msg.role === "user") {
        const text = extractText(msg.content).trim();
        if (!text) continue;
        if (sep) out.push(th.fg("dim", "────"));
        out.push(th.fg("accent", "[User]"));
        for (const l of wrapTextWithAnsi(text, width)) out.push(l);
      } else if (msg.role === "assistant") {
        const text = extractText(msg.content).trim();
        if (sep) out.push(th.fg("dim", "────"));
        out.push(th.bold("[Assistant]"));
        if (text) for (const l of wrapTextWithAnsi(text, width)) out.push(l);
      } else if (msg.role === "toolResult") {
        const text = extractText(msg.content).trim();
        if (!text) continue;
        if (sep) out.push(th.fg("dim", "────"));
        out.push(
          th.fg(
            "dim",
            `[Result · ${(msg as { toolName?: string }).toolName ?? "tool"}]`,
          ),
        );
        const truncated =
          text.length > 500 ? `${text.slice(0, 500)}… (truncated)` : text;
        for (const l of wrapTextWithAnsi(truncated, width))
          out.push(th.fg("dim", l));
      } else {
        continue;
      }
      sep = true;
    }
    if (this.record.status === "running") {
      out.push("");
      out.push(th.fg("accent", "▍ ") + th.fg("dim", this.record.activity));
    }
    return out.map((l) => truncateToWidth(l, width));
  }
}

// ─── Orchestrator ──────────────────────────────────────────────────────────

const LOG_VISIBLE = 6;
const MAX_AGENT_ROWS = 8;
const TICK_MS = 200;

/** Options wired to the Orchestrator by the driver. */
export interface OrchestratorOptions {
  /** Flow display name (e.g. the flow script name). */
  flowName: string;
  /** Resolves when the flow run finishes (success or error). */
  completion: Promise<string | undefined>;
  /** Stop a flow-agent by id (abort its run). */
  onStop: (agentId: string) => void;
  /** Steer a flow-agent by id. */
  onSteer: (agentId: string, message: string) => void;
}

/** A row in the Orchestrator roster: the main session or a flow-agent. */
type RosterEntry =
  | { kind: "main" }
  | { kind: "agent"; record: FlowAgentRecord };

/** The blocking full-screen Orchestrator component. */
export class Orchestrator implements Component {
  private selectedIndex = 0;
  private viewer: ConversationViewer | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private closed = false;
  private stopArmedId: string | undefined;
  private unsubscribe: (() => void) | undefined;
  /** Error message captured when the flow completes. */
  private completionError: string | undefined;

  constructor(
    private tui: TUI,
    private theme: Theme,
    private runner: FlowRunner,
    private options: OrchestratorOptions,
    private done: (result: undefined) => void,
  ) {
    this.unsubscribe = runner.subscribe((event: FlowRunnerEvent) => {
      if (event.type === "complete") this.completionError = event.error;
      this.tui.requestRender();
    });
    this.timer = setInterval(() => this.tui.requestRender(), TICK_MS);
    void this.options.completion.then((error) => {
      this.completionError = error;
      this.close();
    });
  }

  handleInput(data: string): void {
    if (isKeyRelease(data)) return;
    // The viewer owns all input while open.
    if (this.viewer) {
      this.viewer.handleInput(data);
      return;
    }
    if (matchesKey(data, "escape")) {
      // Hide the overlay; the flow keeps running in the background and its
      // result is still delivered to the main session.
      this.close();
      return;
    }
    if (matchesKey(data, "down")) {
      const next = Math.min(this.roster().length - 1, this.selectedIndex + 1);
      if (next !== this.selectedIndex) this.stopArmedId = undefined;
      this.selectedIndex = next;
      this.tui.requestRender();
    } else if (matchesKey(data, "up")) {
      const next = Math.max(0, this.selectedIndex - 1);
      if (next !== this.selectedIndex) this.stopArmedId = undefined;
      this.selectedIndex = next;
      this.tui.requestRender();
    } else if (matchesKey(data, "enter")) {
      this.openSelected();
    } else if (matchesKey(data, "s")) {
      this.steerSelected();
    } else if (matchesKey(data, "x")) {
      this.stopSelected();
    } else if (this.stopArmedId) {
      this.stopArmedId = undefined;
      this.tui.requestRender();
    }
  }

  render(width: number): string[] {
    // The viewer owns the whole screen while open.
    if (this.viewer) return this.viewer.render(width);

    const th = this.theme;
    const innerW = Math.max(1, width - 4);
    const lines: string[] = [];
    const row = (content: string) => {
      const clipped = truncateToWidth(content, innerW);
      return (
        th.fg("border", "│") +
        " " +
        clipped +
        " ".repeat(Math.max(0, innerW - visibleWidth(clipped))) +
        " " +
        th.fg("border", "│")
      );
    };
    const top = th.fg("border", `╭${"─".repeat(Math.max(0, width - 2))}╮`);

    lines.push(top);
    lines.push(
      row(
        th.bold(`AgentFlow · ${this.options.flowName}`) +
          th.fg(
            "dim",
            `  ${this.runner.isComplete ? (this.completionError ? "failed" : "complete") : "running"}`,
          ),
      ),
    );
    lines.push(th.fg("border", `├${"─".repeat(Math.max(0, width - 2))}┤`));

    // Log stream.
    const logs = this.runner.logs.slice(-LOG_VISIBLE);
    if (logs.length === 0) {
      lines.push(row(th.fg("dim", "  (no progress logs yet)")));
    } else {
      for (const line of logs) lines.push(row(th.fg("dim", `  ${line}`)));
    }
    lines.push(th.fg("border", `├${"─".repeat(Math.max(0, width - 2))}┤`));

    // Agent overview (window scrolls so the selected row stays visible).
    const roster = this.roster();
    const visible = Math.min(MAX_AGENT_ROWS, roster.length);
    const start = Math.max(
      0,
      Math.min(this.selectedIndex - visible + 1, roster.length - visible),
    );
    if (start > 0) {
      lines.push(row(th.fg("dim", `  ↑ ${start} more`)));
    }
    for (let i = start; i < start + visible; i++) {
      const entry = roster[i];
      // `▸` marks selection; status icons (●/○/■/✗) stay distinct from it.
      const bullet =
        i === this.selectedIndex ? th.fg("accent", "▸") : th.fg("dim", " ");
      if (entry.kind === "main") {
        lines.push(
          row(
            `${bullet} ${th.bold("main")}  ${th.fg("dim", "(this session)")}`,
          ),
        );
      } else {
        const r = entry.record;
        const left = `${bullet} ${statusIcon(r.status, th)} ${th.bold(r.name)}  ${th.fg("muted", statusLabel(r.status))} · ${th.fg("dim", r.model ?? "inherit")} · ${th.fg("dim", r.activity)}`;
        const right = th.fg("dim", fmtElapsed(r.startedAt, r.completedAt));
        lines.push(row(rightAlign(`  ${left}`, right, innerW)));
      }
    }
    if (roster.length > start + visible) {
      lines.push(
        row(th.fg("dim", `  ↓ ${roster.length - start - visible} more`)),
      );
    }

    // Footer: a pending stop confirmation replaces the normal hints.
    const armed = this.stopArmedId
      ? roster.find(
          (e): e is Extract<RosterEntry, { kind: "agent" }> =>
            e.kind === "agent" && e.record.id === this.stopArmedId,
        )
      : undefined;
    const hint = armed
      ? th.fg(
          "error",
          `press x again to stop "${armed.record.name}" · any other key cancels`,
        )
      : th.fg(
          "dim",
          "↑↓ select · enter view · s steer · x stop · esc hide (flow runs on)",
        );
    lines.push(row(hint));
    lines.push(th.fg("border", `╰${"─".repeat(Math.max(0, width - 2))}╯`));
    return lines;
  }

  invalidate(): void {
    /* nothing cached */
  }

  dispose(): void {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (this.viewer) {
      this.viewer.dispose();
      this.viewer = undefined;
    }
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
  }

  private roster(): RosterEntry[] {
    return [
      { kind: "main" },
      ...this.runner.agents.map((record) => ({
        kind: "agent" as const,
        record,
      })),
    ];
  }

  private openSelected(): void {
    const entry = this.roster()[this.selectedIndex];
    if (!entry || entry.kind === "main") return;
    const record = entry.record;
    const theme = this.theme;
    const tui = this.tui;
    const recordId = record.id;
    this.viewer = new ConversationViewer(
      tui,
      record,
      theme,
      () => {
        this.viewer?.dispose();
        this.viewer = undefined;
        this.tui.requestRender();
      },
      () => this.options.onStop(recordId),
      (message) => this.options.onSteer(recordId, message),
    );
    this.tui.requestRender();
  }

  private steerSelected(): void {
    const entry = this.roster()[this.selectedIndex];
    if (!entry || entry.kind === "main") return;
    const record = entry.record;
    const theme = this.theme;
    const tui = this.tui;
    const recordId = record.id;
    this.viewer = new ConversationViewer(
      tui,
      record,
      theme,
      () => {
        this.viewer?.dispose();
        this.viewer = undefined;
        this.tui.requestRender();
      },
      () => this.options.onStop(recordId),
      (message) => this.options.onSteer(recordId, message),
    );
    // `s` means "steer now": jump straight into the composer when possible.
    if (this.viewer.canSteer()) this.viewer.openComposer();
    this.tui.requestRender();
  }

  private stopSelected(): void {
    const entry = this.roster()[this.selectedIndex];
    if (!entry || entry.kind === "main") return;
    const record = entry.record;
    // Only running/created agents are stoppable; x on anything else is a no-op.
    if (record.status !== "running" && record.status !== "created") return;
    const id = record.id;
    if (this.stopArmedId === id) {
      this.stopArmedId = undefined;
      this.options.onStop(id);
    } else {
      this.stopArmedId = id;
    }
    this.tui.requestRender();
  }

  private close(): void {
    if (this.closed) return;
    this.closed = true;
    this.dispose();
    this.done(undefined);
  }
}

// ─── Drivers ───────────────────────────────────────────────────────────────

/**
 * Run the flow under the blocking full-screen Orchestrator (TUI mode).
 * Resolves when the run completes and the editor is restored.
 */
export async function runTuiFlow(
  ctx: ExtensionContext,
  runner: FlowRunner,
  flowName: string,
  completion: Promise<string | undefined>,
  onStop: (agentId: string) => void,
  onSteer: (agentId: string, message: string) => void,
): Promise<void> {
  await ctx.ui.custom<void>((tui, theme, _keybindings, done) => {
    return new Orchestrator(
      tui,
      theme,
      runner,
      {
        flowName,
        completion,
        onStop,
        onSteer,
      },
      done,
    );
  });
  await completion;
}

/**
 * Run the flow outside TUI mode (print/RPC/JSON): execute the script and
 * surface progress + result without the interactive Orchestrator.
 */
export async function runNonTuiFlow(runner: FlowRunner): Promise<void> {
  const unsub = runner.subscribe((event: FlowRunnerEvent) => {
    if (event.type === "log") {
      // eslint-disable-next-line no-console
      console.log(`[agentflow] ${event.line}`);
    } else if (event.type === "agent_created") {
      // eslint-disable-next-line no-console
      console.log(`[agentflow] spawned agent "${event.record.name}"`);
    }
  });
  // Keep the subscription alive until the runner completes.
  await new Promise<void>((resolve) => {
    const watcher = runner.subscribe((event: FlowRunnerEvent) => {
      if (event.type === "complete") {
        watcher();
        resolve();
      }
    });
  });
  unsub();
}
