/**
 * orchestrator.ts — The AgentFlow fleet UI (pi-subagents style).
 *
 * In TUI mode a flow run lives *alongside* the main editor instead of
 * replacing it:
 *
 * - A render-only **fleet widget** below the editor shows `main` + every
 *   flow-agent with live status, plus the latest `af.log` line. It is always
 *   visible for the duration of the run — there is nothing to "re-open".
 * - All key handling goes through `ctx.ui.onTerminalInput`, gated on an
 *   empty, focused prompt editor: `↓`/`←` activates list navigation, `↑`/`↓`
 *   move the selection, `enter` opens, `s` steers, `x` stops an agent
 *   (two-press arm) or cancels the whole flow when `main` is selected,
 *   `esc` leaves the list. Any other key deactivates the list and flows into
 *   the editor untouched.
 * - Viewing happens in **overlay** components: a live conversation viewer per
 *   agent and a read-only `af.log` viewer for `main`. Closing an overlay
 *   returns to the still-visible fleet widget.
 *
 * In non-TUI modes the flow runs without the UI and the result is still
 * delivered (see `runNonTuiFlow`).
 */

import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  Editor,
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

/** Names of the tool calls in a message's content (empty when none). */
function extractToolCalls(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  const names: string[] = [];
  for (const c of content) {
    if (
      c &&
      typeof c === "object" &&
      (c as { type?: string }).type === "toolCall"
    ) {
      names.push((c as { name?: string }).name ?? "tool");
    }
  }
  return names;
}

// ─── ConversationViewer (overlay) ──────────────────────────────────────────

/** Max-height share of the terminal used by overlay viewers. */
const VIEWER_HEIGHT_PCT = 70;

/**
 * Live, auto-updating conversation viewer for one flow-agent, shown as a
 * centered overlay. Renders completed messages plus the in-flight streaming
 * message and any queued steering messages, so a sent steer is never
 * invisible while it waits for delivery.
 */
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

  /** Open the steering composer (used by `enter` here and `s` from the list). */
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
    // Mirrors the overlay's maxHeight so the viewer never renders more lines
    // than the overlay shows (which would clip the footer).
    const maxRows = Math.floor(
      (this.tui.terminal.rows * VIEWER_HEIGHT_PCT) / 100,
    );
    return Math.max(3, maxRows - 6);
  }

  private buildContentLines(width: number): string[] {
    const th = this.theme;
    const out: string[] = [];
    let sep = false;

    const userBlock = (text: string) => {
      if (sep) out.push(th.fg("dim", "────"));
      out.push(th.fg("accent", "[User]"));
      for (const l of wrapTextWithAnsi(text, width)) out.push(l);
    };

    for (const msg of this.record.session.messages) {
      if (msg.role === "user") {
        const text = extractText(msg.content).trim();
        if (!text) continue;
        userBlock(text);
      } else if (msg.role === "assistant") {
        const text = extractText(msg.content).trim();
        const toolCalls = extractToolCalls(msg.content);
        if (!text && toolCalls.length === 0) continue;
        if (sep) out.push(th.fg("dim", "────"));
        out.push(th.bold("[Assistant]"));
        if (text) for (const l of wrapTextWithAnsi(text, width)) out.push(l);
        for (const name of toolCalls)
          out.push(truncateToWidth(th.fg("muted", `  [Tool: ${name}]`), width));
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

    // The in-flight assistant message lives in `agent.state.streamingMessage`
    // until it settles — `session.messages` only gains it at message end, so
    // without this the viewer would show nothing while the agent streams.
    const streaming = this.record.session.agent.state.streamingMessage;
    if (streaming && streaming.role === "assistant") {
      const text = extractText(streaming.content).trim();
      const toolCalls = extractToolCalls(streaming.content);
      if (text || toolCalls.length > 0) {
        if (sep) out.push(th.fg("dim", "────"));
        out.push(th.bold("[Assistant]"));
        if (text) for (const l of wrapTextWithAnsi(text, width)) out.push(l);
        for (const name of toolCalls)
          out.push(truncateToWidth(th.fg("muted", `  [Tool: ${name}]`), width));
      }
    }

    // Steering messages queue between turns; show them so a sent steer is
    // visibly pending instead of silently swallowed.
    for (const queued of this.record.session.getSteeringMessages()) {
      out.push("");
      out.push(th.fg("accent", "[Steering · queued]"));
      for (const l of wrapTextWithAnsi(queued.trim(), width))
        out.push(th.fg("muted", l));
    }

    if (this.record.status === "running") {
      out.push("");
      out.push(th.fg("accent", "▍ ") + th.fg("dim", this.record.activity));
    }
    return out.map((l) => truncateToWidth(l, width));
  }
}

// ─── LogViewer (overlay) ───────────────────────────────────────────────────

/** Read-only scrollable viewer over the run's `af.log` stream. */
export class LogViewer implements Component {
  private scrollOffset = 0;
  private autoScroll = true;
  private lastInnerW = 0;
  private closed = false;
  private unsubscribe: (() => void) | undefined;

  constructor(
    private tui: TUI,
    private runner: FlowRunner,
    private flowName: string,
    private theme: Theme,
    private done: () => void,
  ) {
    this.unsubscribe = runner.subscribe((event: FlowRunnerEvent) => {
      if (event.type === "log" && !this.closed) this.tui.requestRender();
    });
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape") || matchesKey(data, "q")) {
      if (!this.closed) {
        this.closed = true;
        this.done();
      }
      return;
    }
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
    lines.push(th.fg("border", `╭${"─".repeat(Math.max(0, width - 2))}╮`));
    lines.push(
      row(
        `${th.bold(`AgentFlow · ${this.flowName}`)}  ${th.fg("dim", "progress log")}`,
      ),
    );
    lines.push(row(th.fg("dim", "─".repeat(innerW))));

    const content = this.buildContentLines(innerW);
    const viewport = this.viewportHeight();
    const maxScroll = Math.max(0, content.length - viewport);
    if (this.autoScroll) this.scrollOffset = maxScroll;
    const visibleStart = Math.min(this.scrollOffset, maxScroll);
    for (let i = 0; i < viewport; i++)
      lines.push(row(content[visibleStart + i] ?? ""));

    lines.push(row(th.fg("dim", "─".repeat(innerW))));
    lines.push(row(th.fg("dim", "↑↓ scroll · PgUp/PgDn · Esc close")));
    lines.push(th.fg("border", `╰${"─".repeat(Math.max(0, width - 2))}╯`));
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

  private viewportHeight(): number {
    const maxRows = Math.floor(
      (this.tui.terminal.rows * VIEWER_HEIGHT_PCT) / 100,
    );
    return Math.max(3, maxRows - 6);
  }

  private buildContentLines(width: number): string[] {
    const th = this.theme;
    if (this.runner.logs.length === 0) {
      return [th.fg("dim", "(no progress logs yet)")];
    }
    const out: string[] = [];
    for (const line of this.runner.logs) {
      for (const l of wrapTextWithAnsi(line, width)) out.push(l);
    }
    return out.map((l) => truncateToWidth(l, width));
  }
}

// ─── Fleet widget ──────────────────────────────────────────────────────────

/** Widget key for the below-editor fleet list. */
const FLEET_KEY = "agentflow-fleet";
/** Max agent rows shown at once; extras collapse into "↑/↓ N more". */
const MAX_AGENT_ROWS = 8;
/** Re-render cadence so elapsed times tick while agents run. */
const TICK_MS = 200;

/** Actions wired into the fleet UI by the driver. */
export interface FleetOptions {
  /** Flow display name. */
  flowName: string;
  /** Stop a flow-agent by id (abort + reject further messages). */
  onStopAgent: (agentId: string) => void;
  /** Steer a flow-agent by id. */
  onSteerAgent: (agentId: string, message: string) => void;
  /** Cancel the whole run. */
  onCancelFlow: () => void;
}

/** A row in the fleet list: the main session or a flow-agent. */
type FleetEntry = { kind: "main" } | { kind: "agent"; record: FlowAgentRecord };

/**
 * The below-editor fleet widget: render-only list + `onTerminalInput` key
 * handling (modeled on pi-subagents' FleetView). Navigation keys only act
 * when the prompt editor is focused and empty, so normal typing is never
 * touched.
 */
export class AgentFlowFleet {
  private tui: TUI | undefined;
  private inputUnsub: (() => void) | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private unsubscribe: (() => void) | undefined;
  /** Whether arrow keys currently navigate the list (vs. flow to the editor). */
  private active = false;
  /** 0 = `main`, 1..N = agents. */
  private selectedIndex = 0;
  /** Two-press arm: an agent id for stop, or "cancel" for the whole flow. */
  private armed: string | undefined;
  /** Set while a viewer overlay is open; calling it closes the overlay. */
  private overlayClose: (() => void) | undefined;
  private finished = false;

  constructor(
    private ctx: ExtensionContext,
    private runner: FlowRunner,
    private options: FleetOptions,
  ) {}

  /** Register the widget, the input listener, and the re-render timer. */
  mount(): void {
    this.inputUnsub = this.ctx.ui.onTerminalInput((data) =>
      this.handleKey(data),
    );
    this.unsubscribe = this.runner.subscribe(() => this.requestRender());
    this.ctx.ui.setWidget(
      FLEET_KEY,
      (tui, theme) => {
        this.tui = tui;
        return {
          render: (w: number) => this.render(w, theme),
          invalidate: () => {
            this.tui = undefined;
          },
        };
      },
      { placement: "belowEditor" },
    );
    this.timer = setInterval(() => this.requestRender(), TICK_MS);
  }

  /** Tear down widget/listener/timer. An open overlay stays until its Esc. */
  teardown(): void {
    if (this.finished) return;
    this.finished = true;
    this.active = false;
    this.armed = undefined;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (this.inputUnsub) this.inputUnsub();
    this.inputUnsub = undefined;
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = undefined;
    this.ctx.ui.setWidget(FLEET_KEY, undefined);
    this.tui = undefined;
  }

  private requestRender(): void {
    if (!this.finished) this.tui?.requestRender();
  }

  // ---- Roster ----

  private roster(): FleetEntry[] {
    return [
      { kind: "main" },
      ...this.runner.agents.map((record) => ({
        kind: "agent" as const,
        record,
      })),
    ];
  }

  private clampSelection(): void {
    const max = this.roster().length - 1;
    this.selectedIndex = Math.max(0, Math.min(this.selectedIndex, max));
  }

  // ---- Key handling ----

  /** Returns `{consume:true}` to swallow a key, or undefined to let it through. */
  private handleKey(
    data: string,
  ): { consume?: boolean; data?: string } | undefined {
    if (this.finished) return undefined;
    // Input listeners receive key-press AND key-release under the kitty
    // protocol — act on press only or every tap fires twice.
    if (isKeyRelease(data)) return undefined;
    // While an overlay is open it owns all input.
    if (this.overlayClose) return undefined;
    // Input listeners fire BEFORE the focused component, and dialogs swap the
    // editor out while getEditorText() still reads the detached one. When
    // anything but the editor owns the keyboard, stay out of its keys.
    if (!this.editorHasFocus()) {
      if (this.active) this.deactivate();
      return undefined;
    }

    if (!this.active) {
      // Activate: ↓ or ← at an empty prompt moves focus into the list.
      const isActivator = matchesKey(data, "down") || matchesKey(data, "left");
      if (isActivator && this.ctx.ui.getEditorText() === "") {
        this.active = true;
        this.requestRender();
        return { consume: true };
      }
      return undefined;
    }

    // Active — navigate and act.
    if (matchesKey(data, "down")) {
      const max = this.roster().length - 1;
      if (this.selectedIndex < max) this.disarm();
      this.selectedIndex = Math.min(max, this.selectedIndex + 1);
      this.requestRender();
      return { consume: true };
    }
    if (matchesKey(data, "up")) {
      if (this.selectedIndex === 0) {
        this.deactivate();
        return { consume: true };
      }
      this.disarm();
      this.selectedIndex -= 1;
      this.requestRender();
      return { consume: true };
    }
    if (matchesKey(data, "escape")) {
      this.deactivate();
      return { consume: true };
    }
    if (matchesKey(data, "enter")) {
      this.openSelected();
      return { consume: true };
    }
    if (matchesKey(data, "s")) {
      this.steerSelected();
      return { consume: true };
    }
    if (matchesKey(data, "x")) {
      this.stopOrCancelSelected();
      return { consume: true };
    }

    // Any other key cancels navigation and flows to the editor.
    this.deactivate();
    return undefined;
  }

  /**
   * True when pi's prompt editor owns the keyboard. pi's editor is an
   * `Editor` subclass while dialogs/selectors are not; `focusedComponent` is
   * TUI-private, hence the best-effort peek. Unknowable focus counts as the
   * editor so activation keeps working.
   */
  private editorHasFocus(): boolean {
    const focused = (this.tui as { focusedComponent?: unknown } | undefined)
      ?.focusedComponent;
    return focused == null || focused instanceof Editor;
  }

  private deactivate(): void {
    this.active = false;
    this.disarm();
    this.selectedIndex = 0;
    this.requestRender();
  }

  private disarm(): void {
    this.armed = undefined;
  }

  private openSelected(): void {
    this.clampSelection();
    const entry = this.roster()[this.selectedIndex];
    if (!entry) return;
    this.disarm();
    if (entry.kind === "main") {
      this.openOverlay((tui, theme, done) => {
        return new LogViewer(
          tui,
          this.runner,
          this.options.flowName,
          theme,
          done,
        );
      });
      return;
    }
    const record = entry.record;
    this.openOverlay((tui, theme, done) => {
      return new ConversationViewer(
        tui,
        record,
        theme,
        done,
        () => this.options.onStopAgent(record.id),
        (message) => this.options.onSteerAgent(record.id, message),
      );
    });
  }

  private steerSelected(): void {
    this.clampSelection();
    const entry = this.roster()[this.selectedIndex];
    if (!entry || entry.kind === "main") return;
    this.disarm();
    const record = entry.record;
    this.openOverlay((tui, theme, done) => {
      const viewer = new ConversationViewer(
        tui,
        record,
        theme,
        done,
        () => this.options.onStopAgent(record.id),
        (message) => this.options.onSteerAgent(record.id, message),
      );
      // `s` means "steer now": jump straight into the composer when possible.
      if (viewer.canSteer()) viewer.openComposer();
      return viewer;
    });
  }

  private stopOrCancelSelected(): void {
    this.clampSelection();
    const entry = this.roster()[this.selectedIndex];
    if (!entry) return;

    if (entry.kind === "main") {
      // Two-press cancel of the whole run.
      if (this.armed === "cancel") {
        this.disarm();
        this.options.onCancelFlow();
      } else {
        this.armed = "cancel";
      }
      this.requestRender();
      return;
    }

    const record = entry.record;
    // Only running/created agents are stoppable; x on anything else is a no-op.
    if (record.status !== "running" && record.status !== "created") return;
    if (this.armed === record.id) {
      this.disarm();
      this.options.onStopAgent(record.id);
    } else {
      this.armed = record.id;
    }
    this.requestRender();
  }

  /** Show an overlay viewer and track it so the list stays out of input. */
  private openOverlay(
    factory: (tui: TUI, theme: Theme, done: () => void) => Component,
  ): void {
    const ui = this.ctx.ui;
    this.overlayClose = undefined;
    void ui
      .custom<void>(
        (tui, theme, _keybindings, done) => {
          this.overlayClose = () => done(undefined);
          return factory(tui, theme, () => done(undefined));
        },
        {
          overlay: true,
          overlayOptions: {
            anchor: "center",
            width: "90%",
            maxHeight: `${VIEWER_HEIGHT_PCT}%`,
          },
        },
      )
      .then(
        () => this.clearOverlay(),
        () => this.clearOverlay(),
      );
  }

  private clearOverlay(): void {
    this.overlayClose = undefined;
    this.requestRender();
  }

  // ---- Rendering ----

  private render(width: number, theme: Theme): string[] {
    const th = theme;
    const roster = this.roster();
    this.clampSelection();
    const sel = this.active ? this.selectedIndex : 0;

    const lines: string[] = [];
    // Header: flow identity on the left, latest af.log line on the right.
    const state = this.runner.isComplete ? "complete" : "running";
    const left = `${th.bold(`AgentFlow · ${this.options.flowName}`)} ${th.fg("dim", state)}`;
    const lastLog = this.runner.logs[this.runner.logs.length - 1];
    const header = lastLog
      ? rightAlign(
          left,
          th.fg("dim", truncateToWidth(lastLog, Math.floor(width / 2))),
          width,
        )
      : left;
    lines.push(truncateToWidth(`  ${header}`, width));

    // Hint line — a pending arm replaces the normal hints.
    let hint: string;
    if (this.armed === "cancel") {
      hint = th.fg(
        "error",
        "press x again to CANCEL this flow · any other key cancels",
      );
    } else if (this.armed) {
      const armedAgent = roster.find(
        (e): e is Extract<FleetEntry, { kind: "agent" }> =>
          e.kind === "agent" && e.record.id === this.armed,
      );
      hint = th.fg(
        "error",
        `press x again to stop "${armedAgent?.record.name ?? "agent"}" · any other key cancels`,
      );
    } else if (this.active) {
      hint = th.fg(
        "dim",
        "↑↓ select · enter view · s steer · x stop · x on main cancels · esc back",
      );
    } else {
      hint = th.fg("dim", "↓ to manage agents");
    }
    lines.push(truncateToWidth(`  ${hint}`, width));
    lines.push("");

    // Roster (windowed so the selection stays visible).
    const bullet = (i: number) =>
      i === sel ? th.fg("accent", "●") : th.fg("dim", "○");
    lines.push(
      truncateToWidth(
        `  ${bullet(0)} main  ${th.fg("dim", "(this session · enter for log)")}`,
        width,
      ),
    );

    const agents = roster.slice(1) as Extract<FleetEntry, { kind: "agent" }>[];
    const visible = Math.min(MAX_AGENT_ROWS, agents.length);
    const selAgent = Math.max(0, sel - 1);
    const start = selAgent < visible ? 0 : selAgent - visible + 1;
    if (start > 0) {
      lines.push(
        truncateToWidth(`  ${th.fg("dim", `↑ ${start} more`)}`, width),
      );
    }
    for (let a = start; a < start + visible; a++) {
      const r = agents[a].record;
      const leftPart = `  ${bullet(a + 1)} ${statusIcon(r.status, th)} ${th.bold(r.name)}  ${th.fg("muted", statusLabel(r.status))} · ${th.fg("dim", r.activity)}`;
      const rightPart = th.fg("dim", fmtElapsed(r.startedAt, r.completedAt));
      lines.push(rightAlign(leftPart, rightPart, width));
    }
    if (agents.length > start + visible) {
      lines.push(
        truncateToWidth(
          `  ${th.fg("dim", `↓ ${agents.length - start - visible} more`)}`,
          width,
        ),
      );
    }
    return lines;
  }
}

// ─── Drivers ───────────────────────────────────────────────────────────────

/**
 * Run the flow with the fleet widget (TUI mode). The editor stays usable for
 * the whole run; resolves when the run completes and the UI is torn down.
 */
export async function runTuiFlow(
  ctx: ExtensionContext,
  runner: FlowRunner,
  flowName: string,
  completion: Promise<string | undefined>,
  onStopAgent: (agentId: string) => void,
  onSteerAgent: (agentId: string, message: string) => void,
  onCancelFlow: () => void,
): Promise<void> {
  const fleet = new AgentFlowFleet(ctx, runner, {
    flowName,
    onStopAgent,
    onSteerAgent,
    onCancelFlow,
  });
  fleet.mount();
  try {
    await completion;
  } finally {
    fleet.teardown();
  }
}

/**
 * Run the flow outside TUI mode (print/RPC/JSON): execute the script and
 * surface progress + result without the interactive UI.
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
