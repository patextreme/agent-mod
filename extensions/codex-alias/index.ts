/**
 * pi-codex-alias — register `openai-codex-work` as an independently
 * authenticated alias of Pi's built-in `openai-codex` provider.
 *
 * Use case: two OpenAI Codex subscription accounts (personal and work) in one
 * Pi agent directory, selected through `/model` as `openai-codex/<model>` and
 * `openai-codex-work/<model>`. Credentials are stored and refreshed under
 * separate `auth.json` keys, so logging in or out of one account never touches
 * the other. The built-in provider is left exactly as it ships.
 *
 * The alias reuses the built-in OAuth flow, token refresh, streaming
 * implementation, and model metadata; only the provider id and display name
 * differ. This is manual account selection, not subscription pooling or
 * rate-limit failover.
 */

import { builtinProviders } from "@earendil-works/pi-ai/providers/all";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerCodexAlias } from "./alias.js";

/** Built-in provider to alias. */
const SOURCE_PROVIDER_ID = "openai-codex";

/** Provider id registered for the second (work) account. */
const ALIAS_PROVIDER_ID = "openai-codex-work";

/** Display name shown for the alias in `/login`, `/logout`, and `/model`. */
const ALIAS_PROVIDER_NAME = "OpenAI Codex — Work";

export default function codexAliasExtension(pi: ExtensionAPI): void {
  const source = builtinProviders().find((p) => p.id === SOURCE_PROVIDER_ID);
  if (!source) {
    throw new Error(
      `codex-alias: built-in provider "${SOURCE_PROVIDER_ID}" is unavailable; this extension needs a Pi version that bundles the OpenAI Codex provider`,
    );
  }
  if (!source.auth.oauth) {
    throw new Error(
      `codex-alias: built-in provider "${SOURCE_PROVIDER_ID}" has no OAuth flow; cannot authenticate an independent Codex account`,
    );
  }

  registerCodexAlias(pi, source, {
    id: ALIAS_PROVIDER_ID,
    name: ALIAS_PROVIDER_NAME,
  });
}
