import { readFile } from "node:fs/promises";
import { CONFIG_JSON_PATH } from "./paths.js";
import type { WorkspaceConfig, WorkspaceProfile } from "./types.js";

const PROFILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
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

function validateProfile(raw: unknown, name: string): WorkspaceProfile {
  const profile = asRecord(raw, `workspaces.${name}`);
  const result: WorkspaceProfile = { sections: {} };
  if (profile.description !== undefined) {
    if (typeof profile.description !== "string") throw new Error(`workspaces.${name}.description must be a string`);
    result.description = profile.description;
  }
  if (profile.postApplyMessage !== undefined) {
    if (typeof profile.postApplyMessage !== "string") throw new Error(`workspaces.${name}.postApplyMessage must be a string`);
    result.postApplyMessage = profile.postApplyMessage;
  }
  for (const [key, value] of Object.entries(profile)) {
    if (RESERVED.has(key)) continue;
    if (!PROFILE_NAME.test(key)) throw new Error(`invalid workspace section name in ${name}: ${key}`);
    result.sections[key] = value;
  }
  return result;
}

export function parseWorkspaceConfig(parsed: unknown): WorkspaceConfig {
  rejectSecretKeys(parsed);
  const root = asRecord(parsed, "config");
  const workspaces = asRecord(root.workspaces, "workspaces");
  const result: WorkspaceConfig = { workspaces: {} };
  for (const [name, rawProfile] of Object.entries(workspaces)) {
    if (!PROFILE_NAME.test(name)) throw new Error(`invalid workspace profile name: ${name}`);
    result.workspaces[name] = validateProfile(rawProfile, name);
  }
  return result;
}

export async function loadWorkspaceConfig(path = CONFIG_JSON_PATH): Promise<WorkspaceConfig> {
  try {
    return parseWorkspaceConfig(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`No chat-workspace config found at ${path}. Create it with a top-level { "workspaces": { ... } } object.`);
    }
    throw error;
  }
}

export function getProfile(config: WorkspaceConfig, name: string): WorkspaceProfile {
  const profile = config.workspaces[name];
  if (!profile) throw new Error(`No workspace profile named ${name}.`);
  return profile;
}
