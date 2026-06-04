import { execFile } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { homedir } from "node:os";
import { promisify } from "node:util";
import { CHAT_MOUNT_CONFIG_JSON_PATH, CHAT_MOUNT_MOUNTS_JSON_PATH } from "../paths.js";
import { readJson, writeJson } from "../json.js";
import type { WorkspaceApplyContext, WorkspacePlugin, WorkspacePluginResult } from "../types.js";

type WorkspaceMount = { target: string; mode?: "rw" | "ro" };

const execFileAsync = promisify(execFile);

type MountEntry = { hostPath: string; mode: "rw" | "ro" };
type MountStore = Record<string, Record<string, MountEntry>>;
type MountConfig = { sourceDir?: string; sourceDirs?: string[]; defaultForge?: "github" | "gitlab" | "bitbucket"; cloneMode?: "full" | "shallow" };
type Target = { kind: "path" | "name" | "repo"; slug: string; cloneUrl?: string; ref?: string };

function expandHome(input: string): string {
  return input === "~" || input.startsWith("~/") ? join(homedir(), input.slice(2)) : input;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function sanitize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}

function deriveGuestPath(hostPath: string): string {
  const name = sanitize(basename(hostPath));
  if (!name) throw new Error(`Could not derive mount name for ${hostPath}`);
  return `/${name}`;
}

function stripGitSuffix(value: string): string {
  return value.replace(/\.git$/i, "");
}

function splitRef(input: string): { base: string; ref?: string } {
  const hash = input.lastIndexOf("#");
  if (hash <= 0) return { base: input };
  const ref = input.slice(hash + 1).trim();
  return { base: input.slice(0, hash), ref: ref || undefined };
}

function cloneUrlForForge(forge: string, owner: string, repo: string): string {
  if (forge === "gitlab") return `git@gitlab.com:${owner}/${repo}.git`;
  if (forge === "bitbucket") return `git@bitbucket.org:${owner}/${repo}.git`;
  return `git@github.com:${owner}/${repo}.git`;
}

function parseTarget(raw: string, defaultForge: string): Target | undefined {
  const input = raw.trim();
  const { base, ref } = splitRef(input);
  const expanded = resolve(expandHome(base));
  if (base.startsWith("/") || base.startsWith("~/") || base.startsWith("./") || base.startsWith("../")) return { kind: "path", slug: basename(expanded), ref };
  if (/^[A-Za-z0-9_.-]+$/.test(base)) return { kind: "name", slug: stripGitSuffix(base), ref };
  const shorthand = base.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/);
  if (shorthand) return { kind: "repo", slug: stripGitSuffix(shorthand[2]), cloneUrl: cloneUrlForForge(defaultForge, shorthand[1], stripGitSuffix(shorthand[2])), ref };
  const ssh = base.match(/^git@([^:]+):(.+)$/);
  if (ssh) return { kind: "repo", slug: stripGitSuffix(ssh[2].split("/").filter(Boolean).at(-1) ?? ""), cloneUrl: base, ref };
  if (/^https?:\/\//i.test(base) || /^ssh:\/\//i.test(base)) {
    const url = new URL(base);
    return { kind: "repo", slug: stripGitSuffix(decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? "")), cloneUrl: base, ref };
  }
  return undefined;
}

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, encoding: "utf8" });
  return stdout.trim();
}

async function loadMountConfig(cwd: string): Promise<Required<Pick<MountConfig, "sourceDir" | "cloneMode" | "defaultForge">>> {
  const raw = await readJson<MountConfig>(CHAT_MOUNT_CONFIG_JSON_PATH, {});
  const sourceDir = raw.sourceDir?.trim() || raw.sourceDirs?.[0]?.trim() || process.env.PI_EZ_CHAT_MOUNT_SOURCE_DIR || join(homedir(), "dev");
  const defaultForge = raw.defaultForge ?? "github";
  const cloneMode = raw.cloneMode === "shallow" ? "shallow" : "full";
  return { sourceDir: resolve(expandHome(sourceDir || cwd)), defaultForge, cloneMode };
}

async function resolveHostPath(rawTarget: string, options: WorkspaceApplyContext): Promise<{ hostPath: string; message: string }> {
  const config = await loadMountConfig(options.cwd);
  const target = parseTarget(rawTarget, config.defaultForge);
  if (!target || !target.slug) throw new Error(`Not a supported repository target: ${rawTarget}`);
  if (target.kind === "path") {
    const hostPath = resolve(expandHome(splitRef(rawTarget).base));
    if (!(await exists(hostPath))) throw new Error(`Mount path does not exist: ${hostPath}`);
    return { hostPath, message: `resolved path ${hostPath}` };
  }
  const destination = join(config.sourceDir, target.slug);
  if (target.kind === "name") {
    if (!(await exists(destination))) throw new Error(`No repository named ${target.slug} under ${config.sourceDir}. Did you mean to specify owner/repo or a repo URL?`);
    if (target.ref && !options.dryRun) await git(["checkout", target.ref], destination);
    return { hostPath: destination, message: `found ${target.slug} in ${config.sourceDir}` };
  }
  if (!(await exists(destination))) {
    if (options.dryRun) return { hostPath: destination, message: `would clone ${target.cloneUrl} into ${destination}` };
    await mkdir(config.sourceDir, { recursive: true });
    const args = ["clone", ...(config.cloneMode === "shallow" ? ["--depth", "1"] : []), target.cloneUrl!, destination];
    await execFileAsync("git", args, { cwd: config.sourceDir, encoding: "utf8" });
  }
  if (target.ref && !options.dryRun) await git(["checkout", target.ref], destination);
  return { hostPath: destination, message: `${(await exists(destination)) ? "found" : "would use"} ${target.slug} in ${config.sourceDir}` };
}

function equalMount(a: MountEntry, b: MountEntry): boolean {
  return a.hostPath === b.hostPath && a.mode === b.mode;
}

function parseMounts(raw: unknown): WorkspaceMount[] {
  if (!Array.isArray(raw)) throw new Error("mounts section must be an array");
  return raw.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`mounts[${index}] must be an object`);
    const mount = entry as WorkspaceMount;
    if (typeof mount.target !== "string" || !mount.target.trim()) throw new Error(`mounts[${index}].target must be a non-empty string`);
    if (mount.mode !== undefined && mount.mode !== "rw" && mount.mode !== "ro") throw new Error(`mounts[${index}].mode must be rw or ro`);
    return { target: mount.target.trim(), mode: mount.mode ?? "rw" };
  });
}

async function applyMountsConfig(mounts: WorkspaceMount[], options: WorkspaceApplyContext): Promise<WorkspacePluginResult> {
  if (mounts.length === 0) return { changed: false, summary: ["Mounts: skipped"], warnings: [] };
  const store = await readJson<MountStore>(CHAT_MOUNT_MOUNTS_JSON_PATH, {});
  const conversationMounts = { ...(store[options.conversationId] ?? {}) };
  const warnings: string[] = [];
  let configured = 0;
  let changed = false;

  for (const mount of mounts) {
    const resolved = await resolveHostPath(mount.target, options);
    const guestPath = deriveGuestPath(resolved.hostPath);
    const entry: MountEntry = { hostPath: resolved.hostPath, mode: mount.mode ?? "rw" };
    const existing = conversationMounts[guestPath];
    if (existing && !equalMount(existing, entry)) {
      warnings.push(`Mount ${guestPath} already exists for ${options.conversationId}: ${existing.hostPath} (${existing.mode}); leaving unchanged.`);
      continue;
    }
    configured++;
    if (!existing) {
      changed = true;
      conversationMounts[guestPath] = entry;
    }
  }

  if (!options.dryRun && changed) {
    store[options.conversationId] = conversationMounts;
    await writeJson(CHAT_MOUNT_MOUNTS_JSON_PATH, store);
  }
  return { changed, restartRequired: changed, summary: [`Mounts: ${options.dryRun ? "would configure" : changed ? "configured" : "already configured"} ${configured}`], warnings };
}

export const mountsPlugin: WorkspacePlugin = {
  name: "mounts",
  apply: (ctx) => applyMountsConfig(parseMounts(ctx.config), ctx),
};
