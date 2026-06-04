import { parseIdentity } from "../config.js";
import { CHAT_GIT_CONVERSATIONS_JSON_PATH } from "../paths.js";
import { readJson, writeJson } from "../json.js";
import type { WorkspaceApplyContext, WorkspacePlugin, WorkspacePluginResult } from "../types.js";

type WorkspaceGitConfig = { enabled?: boolean; identity?: string; noSsh?: boolean };

type ConversationGitConfig = {
  enabled: boolean;
  identity?: { name: string; email: string };
  image?: string;
  env?: Record<string, string>;
  ssh?: { enabled?: boolean; agent?: string; allowedHosts?: string[]; knownHostsFiles?: string[] };
  tcp?: { hosts?: Record<string, string> };
};

type GitStore = Record<string, ConversationGitConfig>;

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function parseGitConfig(raw: unknown): WorkspaceGitConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("git section must be an object");
  const config = raw as WorkspaceGitConfig;
  if (config.enabled !== undefined && typeof config.enabled !== "boolean") throw new Error("git.enabled must be boolean");
  if (config.identity !== undefined && typeof config.identity !== "string") throw new Error("git.identity must be a string");
  if (config.noSsh !== undefined && typeof config.noSsh !== "boolean") throw new Error("git.noSsh must be boolean");
  return config;
}

async function applyGitConfig(config: WorkspaceGitConfig, options: WorkspaceApplyContext): Promise<WorkspacePluginResult> {
  if (config.enabled === false) return { changed: false, summary: ["Git: skipped (disabled in profile)"], warnings: [] };

  const store = await readJson<GitStore>(CHAT_GIT_CONVERSATIONS_JSON_PATH, {});
  const previous = store[options.conversationId] ?? { enabled: false };
  const next: ConversationGitConfig = {
    ...previous,
    enabled: true,
    ...(config.identity ? { identity: parseIdentity(config.identity) } : {}),
    ssh: {
      ...(previous.ssh ?? {}),
      ...(config.noSsh !== undefined ? { enabled: !config.noSsh } : {}),
    },
  };
  if (Object.keys(next.ssh ?? {}).length === 0) delete next.ssh;

  const changed = !same(previous, next);
  if (!options.dryRun && changed) {
    store[options.conversationId] = next;
    await writeJson(CHAT_GIT_CONVERSATIONS_JSON_PATH, store);
  }

  const bits = ["enabled"];
  if (config.identity) bits.push(`identity ${config.identity}`);
  if (config.noSsh !== undefined) bits.push(config.noSsh ? "SSH disabled" : "SSH enabled");
  return {
    changed,
    restartRequired: changed,
    summary: [`Git: ${options.dryRun ? "would configure" : changed ? "configured" : "already configured"} (${bits.join(", ")})`],
    warnings: [],
  };
}

export const gitPlugin: WorkspacePlugin = {
  name: "git",
  apply: (ctx) => applyGitConfig(parseGitConfig(ctx.config), ctx),
};
