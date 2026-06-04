import { CHAT_NET_CONFIG_JSON_PATH } from "../paths.js";
import { readJson, writeJson } from "../json.js";
import type { WorkspaceApplyContext, WorkspacePlugin, WorkspacePluginResult } from "../types.js";

type WorkspaceNetConfig = { enabled?: boolean; profile?: string; allowedHosts?: string[] };
type ChatNetConfig = { allowedHosts: string[] };

function parseNetConfig(raw: unknown): WorkspaceNetConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("net section must be an object");
  const config = raw as WorkspaceNetConfig;
  if (config.enabled !== undefined && typeof config.enabled !== "boolean") throw new Error("net.enabled must be boolean");
  if (config.profile !== undefined && typeof config.profile !== "string") throw new Error("net.profile must be a string");
  if (config.allowedHosts !== undefined) {
    if (!Array.isArray(config.allowedHosts) || config.allowedHosts.some((host) => typeof host !== "string" || !host.trim())) {
      throw new Error("net.allowedHosts must be an array of non-empty strings");
    }
  }
  return config;
}

async function applyNetConfig(config: WorkspaceNetConfig, options: WorkspaceApplyContext): Promise<WorkspacePluginResult> {
  if (config.enabled === false) return { changed: false, summary: ["Net: skipped"], warnings: [] };
  if (!config.allowedHosts || config.allowedHosts.length === 0) {
    return {
      changed: false,
      summary: ["Net: skipped"],
      warnings: ["Net profile support is deferred in v1; add net.allowedHosts to merge chat-net hosts explicitly."],
    };
  }
  const existing = await readJson<ChatNetConfig>(CHAT_NET_CONFIG_JSON_PATH, { allowedHosts: [] });
  const allowedHosts = Array.isArray(existing.allowedHosts) ? existing.allowedHosts : [];
  const seen = new Set(allowedHosts.map((host) => host.toLowerCase()));
  const additions = config.allowedHosts.map((host) => host.trim()).filter((host) => !seen.has(host.toLowerCase()));
  const changed = additions.length > 0;
  if (!options.dryRun && changed) await writeJson(CHAT_NET_CONFIG_JSON_PATH, { ...existing, allowedHosts: [...allowedHosts, ...additions] });
  return {
    changed,
    restartRequired: changed,
    summary: [`Net: ${options.dryRun ? "would add" : changed ? "added" : "already configured"} ${additions.length} allowed host${additions.length === 1 ? "" : "s"}`],
    warnings: [],
  };
}

export const netPlugin: WorkspacePlugin = {
  name: "net",
  apply: (ctx) => applyNetConfig(parseNetConfig(ctx.config), ctx),
};
