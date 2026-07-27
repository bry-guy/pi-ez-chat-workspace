import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CHAT_WORKSPACE_DIR, CONFIG_JSON_PATH } from "./paths.js";
import type { WorkspaceProfile } from "./types.js";

const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const RESERVED = new Set(["description", "postApplyMessage"]);
const SECRET_KEYS = /(?:secret|token|password|passwd|privatekey|private_key|apikey|api_key|credential)/i;

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function rejectSecretKeys(value: unknown, path = "config"): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectSecretKeys(entry, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (path === "config" && key === "secrets") continue;
    if (SECRET_KEYS.test(key)) throw new Error(`${path}.${key} looks like a secret field; workspace profiles must not store secrets`);
    rejectSecretKeys(child, `${path}.${key}`);
  }
}

export function parseIdentity(input: string) {
  const trimmed = input.trim();
  const match = trimmed.match(/^(.+?)\s*<([^<>\s]+@[^<>\s]+)>$/);
  if (!match) throw new Error('identity must look like: "Name <email@example.com>"');
  return { name: match[1].trim(), email: match[2].trim() };
}

export function normalizeWorkspaceName(name: string | undefined): string {
  const normalized = (name || "default").trim() || "default";
  if (!SLUG.test(normalized)) throw new Error(`invalid workspace name: ${normalized}`);
  return normalized;
}

export function workspaceConfigPath(name?: string): string {
  const normalized = normalizeWorkspaceName(name);
  return normalized === "default" ? CONFIG_JSON_PATH : join(CHAT_WORKSPACE_DIR, `${normalized}-config.json`);
}

export function parseWorkspaceProfile(parsed: unknown): WorkspaceProfile {
  rejectSecretKeys(parsed);
  const profile = asRecord(parsed, "workspace config");
  if (profile.workspaces !== undefined) {
    throw new Error('workspace config files now describe one workspace directly; remove the top-level "workspaces" wrapper');
  }

  const result: WorkspaceProfile = { sections: {} };
  if (profile.description !== undefined) {
    if (typeof profile.description !== "string") throw new Error("description must be a string");
    result.description = profile.description;
  }
  if (profile.postApplyMessage !== undefined) {
    if (typeof profile.postApplyMessage !== "string") throw new Error("postApplyMessage must be a string");
    result.postApplyMessage = profile.postApplyMessage;
  }
  for (const [key, value] of Object.entries(profile)) {
    if (RESERVED.has(key)) continue;
    if (!SLUG.test(key)) throw new Error(`invalid workspace section name: ${key}`);
    result.sections[key] = value;
  }
  return result;
}

export async function loadWorkspaceProfile(name?: string): Promise<{ name: string; path: string; profile: WorkspaceProfile }> {
  const normalized = normalizeWorkspaceName(name);
  const path = workspaceConfigPath(normalized);
  try {
    return { name: normalized, path, profile: parseWorkspaceProfile(JSON.parse(await readFile(path, "utf8"))) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`No chat-workspace config found for ${normalized} at ${path}.`);
    }
    throw error;
  }
}
