import { createInterface, type Interface } from "node:readline/promises";

export class SteeringError extends Error {
  constructor(
    public readonly outcome: "needs_human" | "cancelled" | "failed",
    message: string,
  ) {
    super(message);
    this.name = "SteeringError";
  }
}

export interface SteeringOptions {
  input?: NodeJS.ReadableStream & { isTTY?: boolean };
  output?: NodeJS.WritableStream & { isTTY?: boolean };
  timeoutMs?: number;
}

/** Collect every explicit answer, or reject without returning partial steering. */
export async function collectSteering(
  issues: { id: string; issue: string; recommendation: string }[],
  signal?: AbortSignal,
  options: SteeringOptions = {},
): Promise<Record<string, string>> {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stderr;
  const timeoutMs = options.timeoutMs ?? 604800000;

  if (signal?.aborted) {
    throw new SteeringError("cancelled", "Steering collection was cancelled.");
  }
  if (!input.isTTY || !output.isTTY) {
    throw new SteeringError(
      "needs_human",
      "Steering requires both input and output to be TTYs.",
    );
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 2147483647) {
    throw new SteeringError("failed", "Invalid steering timeoutMs.");
  }
  if (issues.length === 0) return {};

  const controller = new AbortController();
  let readline: Interface | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failure: SteeringError | undefined;
  let rejectFailure!: (error: SteeringError) => void;
  const interrupted = new Promise<never>((_, reject) => {
    rejectFailure = reject;
  });
  // A stream can fail synchronously during interface creation or output.write.
  // Keep the rejection handled even before the first question is awaiting it.
  void interrupted.catch(() => {});

  const fail = (error: SteeringError) => {
    if (failure) return;
    failure = error;
    rejectFailure(error);
    controller.abort();
  };
  const onAbort = () =>
    fail(new SteeringError("cancelled", "Steering collection was cancelled."));
  const onClose = () =>
    fail(
      new SteeringError(
        "needs_human",
        "Steering input closed (EOF) before all answers were collected.",
      ),
    );
  const onError = (error: Error) =>
    fail(
      new SteeringError("failed", `Steering stream failed: ${error.message}`),
    );

  try {
    input.on("error", onError);
    output.on("error", onError);
    signal?.addEventListener("abort", onAbort, { once: true });
    readline = createInterface({ input, output, terminal: false });
    readline.on("close", onClose);
    readline.on("error", onError);
    timer = setTimeout(
      () =>
        fail(
          new SteeringError(
            "failed",
            `Steering timed out after ${timeoutMs} ms before all answers were collected.`,
          ),
        ),
      timeoutMs,
    );
    if (signal?.aborted) onAbort();

    const answers: Record<string, string> = {};
    for (const { id, issue, recommendation } of issues) {
      if (failure) throw failure;
      output.write(`\n[${id}] ${issue}\nRecommendation: ${recommendation}\n`);
      let answer = "";
      while (!answer) {
        if (failure) throw failure;
        answer = (
          await Promise.race([
            readline.question("Your steering: ", { signal: controller.signal }),
            interrupted,
          ])
        ).trim();
        // EOF can emit an unterminated last line. Never accept it as consent.
        if (failure) throw failure;
        if (!answer) output.write("Please enter a non-blank answer.\n");
      }
      // Define an own property even for IDs such as "__proto__".
      Object.defineProperty(answers, id, {
        value: answer,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return answers;
  } catch (error) {
    if (failure) throw failure;
    if (error instanceof SteeringError) throw error;
    throw new SteeringError(
      "failed",
      `Steering collection failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
    readline?.removeListener("close", onClose);
    readline?.removeListener("error", onError);
    controller.abort();
    readline?.close();
    input.removeListener("error", onError);
    output.removeListener("error", onError);
  }
}
