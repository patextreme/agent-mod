import { z } from "zod";

export const chainStepPromptSchema = z.strictObject({
  type: z.literal("prompt"),
  prompt: z.string().trim().min(1),
});

export const chainStepExitPromptSchema = z.strictObject({
  type: z.literal("exitPrompt"),
  exitPrompt: z.string().trim().min(1),
});

export const chainStepCallChainSchema = z.strictObject({
  type: z.literal("callChain"),
  name: z.string().trim().min(1),
  argument: z.string().optional(),
});

export const chainStepSchema = z.preprocess(
  (data) => {
    if (typeof data === "object" && data !== null && !("type" in data)) {
      return { ...data, type: "prompt" };
    }
    return data;
  },
  z.discriminatedUnion("type", [
    chainStepPromptSchema,
    chainStepExitPromptSchema,
    chainStepCallChainSchema,
  ]),
);

export const chainDefinitionSchema = z.strictObject({
  description: z.string().trim().min(1).optional(),
  loop: z.number().int().positive().optional(),
  steps: z.array(chainStepSchema).min(1),
});

export type ChainStep = z.infer<typeof chainStepSchema>;

export type ChainDefinition = z.infer<typeof chainDefinitionSchema>;

export function getValueAtPath(
  data: unknown,
  path: (string | number)[],
): unknown {
  let current = data;
  for (const key of path) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string | number, unknown>)[key];
  }
  return current;
}

export const ORANGE = "\x1b[38;5;214m";
export const RESET = "\x1b[0m";

export function formatValidationIssues(
  file: string,
  raw: unknown,
  issues: z.ZodError["issues"],
  format: (msg: string) => string,
): string[] {
  return issues.map((issue) => {
    const path = (issue.path as (string | number)[]).join(".");
    const received = getValueAtPath(raw, issue.path as (string | number)[]);
    return format(
      `[chain] Skipping ${file}: field "${path || "(root)"}" — ${issue.message} (received: ${JSON.stringify(received)})`,
    );
  });
}
