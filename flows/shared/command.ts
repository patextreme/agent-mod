import { execFile } from "node:child_process";
import { promisify } from "node:util";

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}
export type Command = (
  args: string[],
  cwd: string,
  signal?: AbortSignal,
) => Promise<CommandResult>;
const execute = promisify(execFile);

/** Invoke OpenSpec directly; operational exits remain data, not successful results. */
export const command: Command = async (args, cwd, signal) => {
  try {
    const result = await execute("openspec", args, {
      cwd,
      signal,
      maxBuffer: 8 * 1024 * 1024,
    });
    return { ...result, exitCode: 0 };
  } catch (error) {
    const failure = error as Error & {
      code?: number;
      stdout?: string;
      stderr?: string;
    };
    if (typeof failure.code !== "number" || signal?.aborted) throw error;
    return {
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
      exitCode: failure.code,
    };
  }
};
