import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Model, Provider } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerCodexAlias } from "./alias.js";

const API = "openai-codex-responses" as const;
type CodexModel = Model<typeof API>;

const ALIAS_ID = "openai-codex-work";
const ALIAS_NAME = "OpenAI Codex — Work";

function makeModel(overrides: Partial<CodexModel> = {}): CodexModel {
  return {
    id: "gpt-5-codex",
    name: "GPT-5 Codex",
    api: API,
    provider: "openai-codex",
    baseUrl: "https://chatgpt.com/backend-api/codex",
    input: ["text"],
    cost: { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0 },
    reasoning: true,
    contextWindow: 272_000,
    maxTokens: 128_000,
    ...overrides,
  };
}

interface SourceOptions {
  withOAuth?: boolean;
  withGetAllModels?: boolean;
}

/**
 * Minimal stand-in for a built-in `Provider`. Streams are never invoked by
 * these tests; the object is cast because a full `AssistantMessageEventStream`
 * is out of scope for a unit fixture.
 */
function makeSource(
  models: CodexModel[] = [makeModel()],
  { withOAuth = true, withGetAllModels = true }: SourceOptions = {},
): Provider {
  return {
    id: "openai-codex",
    name: "OpenAI Codex",
    auth: {
      apiKey: {
        name: "OpenAI API key",
        resolve: async () => ({ auth: { apiKey: "ambient" } }),
      },
      ...(withOAuth
        ? {
            oauth: {
              name: "OpenAI Codex",
              login: async () => ({
                type: "oauth",
                refresh: "refresh",
                access: "access",
                expires: 0,
              }),
              refresh: async <T>(credential: T): Promise<T> => credential,
              toAuth: async () => ({ apiKey: "oauth" }),
            },
          }
        : {}),
    },
    getModels: () => models,
    ...(withGetAllModels ? { getAllModels: () => models } : {}),
    stream: () => {
      throw new Error("stream is not exercised by these unit tests");
    },
    streamSimple: () => {
      throw new Error("streamSimple is not exercised by these unit tests");
    },
  } as unknown as Provider;
}

function captureProviders(): { pi: ExtensionAPI; registered: Provider[] } {
  const registered: Provider[] = [];
  const pi = {
    registerProvider: (provider: Provider) => {
      registered.push(provider);
    },
  } as unknown as ExtensionAPI;
  return { pi, registered };
}

describe("registerCodexAlias", () => {
  it("registers the alias under the requested id and display name", () => {
    const { pi, registered } = captureProviders();
    registerCodexAlias(pi, makeSource(), { id: ALIAS_ID, name: ALIAS_NAME });

    assert.strictEqual(registered.length, 1);
    assert.strictEqual(registered[0].id, ALIAS_ID);
    assert.strictEqual(registered[0].name, ALIAS_NAME);
  });

  it("keeps the source OAuth flow but overrides its display name", () => {
    const source = makeSource();
    const { pi, registered } = captureProviders();
    registerCodexAlias(pi, source, { id: ALIAS_ID, name: ALIAS_NAME });

    const aliasOauth = registered[0].auth.oauth;
    assert.ok(aliasOauth, "alias must expose the built-in OAuth flow");
    assert.strictEqual(aliasOauth.name, ALIAS_NAME);
    assert.notStrictEqual(aliasOauth.name, source.auth.oauth?.name);
    // Same flow objects: login, refresh, and toAuth stay the built-in code.
    assert.strictEqual(aliasOauth.login, source.auth.oauth?.login);
    assert.strictEqual(aliasOauth.refresh, source.auth.oauth?.refresh);
    assert.strictEqual(aliasOauth.toAuth, source.auth.oauth?.toAuth);
  });

  it("drops apiKey auth so the alias cannot use ambient credentials", () => {
    const source = makeSource();
    assert.ok(source.auth.apiKey, "fixture must start with apiKey auth");

    const { pi, registered } = captureProviders();
    registerCodexAlias(pi, source, { id: ALIAS_ID, name: ALIAS_NAME });

    assert.strictEqual(registered[0].auth.apiKey, undefined);
  });

  it("reuses model metadata and rewrites provider on every model", () => {
    const sourceModels = [
      makeModel(),
      makeModel({
        id: "gpt-5.2-codex",
        cost: { input: 2, output: 16, cacheRead: 0.2, cacheWrite: 0 },
        contextWindow: 400_000,
      }),
    ];
    const { pi, registered } = captureProviders();
    registerCodexAlias(pi, makeSource(sourceModels), {
      id: ALIAS_ID,
      name: ALIAS_NAME,
    });

    const aliasModels = registered[0].getModels();
    assert.strictEqual(aliasModels.length, sourceModels.length);
    for (let i = 0; i < sourceModels.length; i++) {
      assert.strictEqual(aliasModels[i].id, sourceModels[i].id);
      assert.strictEqual(aliasModels[i].name, sourceModels[i].name);
      assert.strictEqual(aliasModels[i].api, sourceModels[i].api);
      assert.strictEqual(aliasModels[i].baseUrl, sourceModels[i].baseUrl);
      assert.deepStrictEqual(aliasModels[i].cost, sourceModels[i].cost);
      assert.strictEqual(
        aliasModels[i].contextWindow,
        sourceModels[i].contextWindow,
      );
      assert.strictEqual(aliasModels[i].maxTokens, sourceModels[i].maxTokens);
      assert.strictEqual(aliasModels[i].reasoning, sourceModels[i].reasoning);
      assert.strictEqual(aliasModels[i].provider, ALIAS_ID);
    }
  });

  it("re-reads the source catalog on every call", () => {
    const models = [makeModel()];
    const { pi, registered } = captureProviders();
    registerCodexAlias(pi, makeSource(models), {
      id: ALIAS_ID,
      name: ALIAS_NAME,
    });
    const alias = registered[0];

    assert.strictEqual(alias.getModels().length, 1);
    assert.strictEqual(alias.getAllModels?.().length, 1);

    models.push(makeModel({ id: "gpt-5.2-codex" }));

    assert.strictEqual(alias.getModels().length, 2);
    assert.strictEqual(alias.getAllModels?.().length, 2);
    assert.strictEqual(alias.getModels()[1].provider, ALIAS_ID);
  });

  it("falls back to getModels when the source has no getAllModels", () => {
    const models = [makeModel(), makeModel({ id: "gpt-5.2-codex" })];
    const source = makeSource(models, { withGetAllModels: false });
    assert.strictEqual(source.getAllModels, undefined);

    const { pi, registered } = captureProviders();
    registerCodexAlias(pi, source, { id: ALIAS_ID, name: ALIAS_NAME });

    const allModels = registered[0].getAllModels?.();
    assert.strictEqual(allModels?.length, models.length);
    assert.strictEqual(allModels?.[0].provider, ALIAS_ID);
  });

  it("throws when the source provider has no OAuth flow", () => {
    const { pi } = captureProviders();
    assert.throws(
      () =>
        registerCodexAlias(
          pi,
          makeSource([makeModel()], { withOAuth: false }),
          { id: ALIAS_ID, name: ALIAS_NAME },
        ),
      /no OAuth flow/,
    );
  });
});
