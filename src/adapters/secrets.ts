import type { WorkspaceApplyContext, WorkspacePlugin, WorkspacePluginResult } from "../types.js";

type BrokerApi = {
  upsertGithubAppPolicy(conversationId: string, repos: string[]): Promise<unknown>;
  upsertOpReadPolicy(conversationId: string, refs: string[]): Promise<unknown>;
};

type ChatGitApi = {
  configureGithubAppAuth(conversationId: string, repos: string[]): Promise<unknown>;
};

type SecretsConfig = {
  github?: { kind?: "github-app-token"; repos: string[] };
  opRead?: string[] | { refs: string[] };
  env?: Record<string, { kind: "op-read"; ref: string }>;
};

function brokerApi(): BrokerApi {
  const api = (globalThis as Record<symbol, unknown>)[Symbol.for("pi-ez-secret-broker.api.v1")] as BrokerApi | undefined;
  if (!api) throw new Error("workspace secrets require pi-ez-secret-broker to be installed/loaded");
  return api;
}

function chatGitApi(): ChatGitApi | undefined {
  return (globalThis as Record<symbol, unknown>)[Symbol.for("pi-ez-chat-git.config.v1")] as ChatGitApi | undefined;
}

function normalizeRepo(repo: unknown): string {
  const value = String(repo ?? "").trim().replace(/\.git$/, "");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) throw new Error(`invalid GitHub repo: ${repo}`);
  return value;
}

function normalizeOpRef(ref: unknown): string {
  const value = String(ref ?? "").trim();
  if (!value.startsWith("op://")) throw new Error(`invalid 1Password ref: ${ref}`);
  return value;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function parseSecretsConfig(raw: unknown): SecretsConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("secrets section must be an object");
  const input = raw as SecretsConfig;
  const result: SecretsConfig = {};
  if (input.github !== undefined) {
    if (!input.github || typeof input.github !== "object" || Array.isArray(input.github)) throw new Error("secrets.github must be an object");
    if (input.github.kind !== undefined && input.github.kind !== "github-app-token") throw new Error("secrets.github.kind must be github-app-token");
    if (!Array.isArray(input.github.repos)) throw new Error("secrets.github.repos must be an array");
    result.github = { kind: "github-app-token", repos: input.github.repos.map(normalizeRepo) };
  }
  if (input.opRead !== undefined) {
    const refs = Array.isArray(input.opRead) ? input.opRead : input.opRead?.refs;
    if (!Array.isArray(refs)) throw new Error("secrets.opRead must be an array or { refs: [...] }");
    result.opRead = refs.map(normalizeOpRef);
  }
  if (input.env !== undefined) {
    if (!input.env || typeof input.env !== "object" || Array.isArray(input.env)) throw new Error("secrets.env must be an object");
    result.env = {};
    for (const [name, spec] of Object.entries(input.env)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`invalid secrets.env key: ${name}`);
      if (!spec || typeof spec !== "object" || Array.isArray(spec) || spec.kind !== "op-read") throw new Error(`secrets.env.${name} must be { kind: "op-read", ref: "op://..." }`);
      result.env[name] = { kind: "op-read", ref: normalizeOpRef(spec.ref) };
    }
  }
  return result;
}

async function applySecretsConfig(config: SecretsConfig, ctx: WorkspaceApplyContext): Promise<WorkspacePluginResult> {
  const summary: string[] = [];
  const warnings: string[] = [];
  const githubRepos = config.github?.repos ?? [];
  const opRefs = unique([...(Array.isArray(config.opRead) ? config.opRead : config.opRead?.refs ?? []), ...Object.values(config.env ?? {}).map((entry) => entry.ref)]);

  if (!ctx.dryRun) {
    const broker = brokerApi();
    if (githubRepos.length > 0) {
      await broker.upsertGithubAppPolicy(ctx.conversationId, githubRepos);
      const git = chatGitApi();
      if (git) await git.configureGithubAppAuth(ctx.conversationId, githubRepos);
      else warnings.push("pi-ez-chat-git config API is unavailable; broker policy was updated but git auth was not switched to GitHub App mode.");
    }
    if (opRefs.length > 0) await broker.upsertOpReadPolicy(ctx.conversationId, opRefs);
  }

  if (githubRepos.length > 0) summary.push(`Secrets: ${ctx.dryRun ? "would allow" : "allowed"} GitHub App repos (${githubRepos.join(", ")})`);
  if (opRefs.length > 0) summary.push(`Secrets: ${ctx.dryRun ? "would allow" : "allowed"} 1Password refs (${opRefs.length})`);
  if (summary.length === 0) summary.push("Secrets: no broker-backed secrets configured");
  return { changed: githubRepos.length > 0 || opRefs.length > 0, restartRequired: githubRepos.length > 0 || opRefs.length > 0, summary, warnings };
}

export const secretsPlugin: WorkspacePlugin = {
  name: "secrets",
  apply: (ctx) => applySecretsConfig(parseSecretsConfig(ctx.config), ctx),
};
