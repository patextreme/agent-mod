# Codex Alias Extension

Part of [Agent Mod](../../README.md).

Registers `openai-codex-secondary` — "OpenAI Codex — Secondary" — as an independently authenticated alias of Pi's built-in `openai-codex` provider, so two OpenAI Codex subscription accounts (personal and secondary) can be used from one Pi agent directory and selected through `/model` as `openai-codex/<model>` and `openai-codex-secondary/<model>`. This is manual account selection, not subscription pooling or rate-limit failover.

The extension reuses the built-in provider's OAuth login, token refresh, streaming implementation, and model catalog. Only the provider id, the display name, and the `auth.json` credential key differ; the built-in `openai-codex` provider is left unchanged.

**Setup:**
1. Load the extension (`pi -e <path-to-pi-codex-alias>` or through your Pi config).
2. `/login` → choose **OpenAI Codex (legacy)** for the personal account — the built-in provider's display name; its OAuth flow is labeled "OpenAI (ChatGPT Plus/Pro)".
3. `/login` → choose **OpenAI Codex — Secondary** for the secondary account. Sign out of ChatGPT in the browser first, or use a private window: the browser reuses the existing ChatGPT session, so otherwise both entries end up holding the same account.
4. Choose the account per model through `/model`.

Credentials are stored under separate `auth.json` keys (`openai-codex` and `openai-codex-secondary`), and refresh runs per provider id under Pi's credential lock, so refreshing or logging out of one account does not modify the other. The alias exposes OAuth only — it never falls back to an ambient `OPENAI_API_KEY`.

**Catalog inheritance.** The alias re-reads the built-in Codex catalog on every call, so it follows the models bundled with the running Pi. It does **not** inherit a `models.json` override keyed by `openai-codex`; override `openai-codex-secondary` separately if you need a per-account base URL or headers.

**Cross-provider sessions.** Pi's Responses converter keeps reasoning and tool-call ids intact only when provider, API, and model all match. `openai-codex-secondary` is not in Pi's Codex tool-call provider allowlist (`CODEX_TOOL_CALL_PROVIDERS` is `openai`, `openai-codex`, `opencode`), so switching accounts mid-conversation is treated like switching vendors: encrypted reasoning is replaced with plain text and tool-call ids are normalized consistently, keeping each `function_call` paired with its `function_call_output`. Staying on one provider preserves full fidelity. This is the documented low-risk behavior; a real request after a switch has not been sent.

**Supported Pi versions.** Requires a Pi that bundles the `openai-codex` provider with OAuth, at or above the version in [Requirements](../../README.md#requirements). If the provider or its OAuth flow is unavailable, the extension fails fast with a clear error instead of registering a broken provider.
