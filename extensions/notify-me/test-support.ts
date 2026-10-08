import type { Scheduler } from "./delivery.js";

export async function flush(): Promise<void> {
  for (let i = 0; i < 40; ++i) await Promise.resolve();
}

export class FakeClock implements Scheduler {
  now = 0;
  readonly scheduled: number[] = [];
  private nextId = 0;
  private readonly timers = new Map<
    number,
    { at: number; callback: () => void }
  >();

  schedule(callback: () => void, milliseconds: number) {
    const id = ++this.nextId;
    this.scheduled.push(milliseconds);
    this.timers.set(id, { at: this.now + milliseconds, callback });
    return {
      cancel: () => {
        this.timers.delete(id);
      },
    };
  }

  get active(): number {
    return this.timers.size;
  }

  async advance(milliseconds: number): Promise<void> {
    await flush();
    const target = this.now + milliseconds;
    for (;;) {
      const due = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      this.now = due[1].at;
      this.timers.delete(due[0]);
      due[1].callback();
      await flush();
    }
    this.now = target;
    await flush();
  }
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
