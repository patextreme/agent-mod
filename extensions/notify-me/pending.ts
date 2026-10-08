export interface PendingNotification {
  readonly message: string;
  readonly armedAt: number;
  readonly webhookUrl: string;
  readonly session: number;
}

/** Owns only pending work, never an already-dispatched notification. */
export class PendingNotifications {
  private generation = 0;
  private session = 0;
  private pending: PendingNotification | undefined;

  beginArm(): number {
    return ++this.generation;
  }

  isCurrent(generation: number): boolean {
    return generation === this.generation;
  }

  arm(
    generation: number,
    message: string,
    webhookUrl: string,
    armedAt: number,
  ): boolean {
    if (!this.isCurrent(generation)) return false;
    this.pending = Object.freeze({
      message,
      webhookUrl,
      armedAt,
      session: this.session,
    });
    return true;
  }

  clear(): void {
    ++this.generation;
    this.pending = undefined;
  }

  resetSession(): void {
    this.clear();
    ++this.session;
  }

  /** Invalidate outstanding reads and consume before invoking any delivery code. */
  take(): PendingNotification | undefined {
    const pending = this.pending;
    this.clear();
    return pending;
  }
}
