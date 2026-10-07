import type { Provider } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Identity of the alias provider registered on top of a source provider. */
export interface CodexAliasOptions {
  /** Provider id for the alias, which is also its `auth.json` credential key. */
  id: string;
  /** Display name shown in `/login`, `/logout`, and `/model`. */
  name: string;
}

/**
 * Register an independently authenticated alias of a built-in provider.
 *
 * The alias spreads the source provider, so it inherits the built-in OAuth
 * flow, token refresh, streaming implementation, and model metadata. Only the
 * provider id — and therefore the credential store key — and display name
 * change. The source provider is left untouched.
 *
 * Auth is narrowed to OAuth only: the alias must never fall back to an ambient
 * API key (`OPENAI_API_KEY` and friends) meant for the account that ambient
 * credential belongs to.
 *
 * `getModels`/`getAllModels` re-read the source on every call rather than
 * copying at registration time, so catalog changes in a running Pi propagate
 * to the alias.
 */
export function registerCodexAlias(
  pi: ExtensionAPI,
  source: Provider,
  { id, name }: CodexAliasOptions,
): void {
  const oauth = source.auth.oauth;
  if (!oauth) {
    throw new Error(
      `codex-alias: source provider "${source.id}" has no OAuth flow to reuse`,
    );
  }

  pi.registerProvider({
    ...source,
    id,
    name,
    // OAuth only — dropping apiKey keeps the alias from silently reusing
    // another account's ambient credentials.
    auth: { oauth: { ...oauth, name } },
    getModels: () =>
      source.getModels().map((model) => ({ ...model, provider: id })),
    getAllModels: () =>
      (source.getAllModels?.() ?? source.getModels()).map((model) => ({
        ...model,
        provider: id,
      })),
  });
}
