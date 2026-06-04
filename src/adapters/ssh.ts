import { CHAT_SSH_CONFIG_JSON_PATH } from "../paths.js";
import { readJson, writeJson } from "../json.js";
import type { WorkspaceApplyContext, WorkspacePlugin, WorkspacePluginResult } from "../types.js";

type WorkspaceSshHost = { alias: string; address: string; user: string; port?: number };
type WorkspaceSshConfig = { hosts?: WorkspaceSshHost[] };
type ChatSshConfig = { hosts: WorkspaceSshHost[]; knownHostsFile?: string };

const DNS_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

function parseSshConfig(raw: unknown): WorkspaceSshConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("ssh section must be an object");
  const config = raw as WorkspaceSshConfig;
  if (config.hosts !== undefined && !Array.isArray(config.hosts)) throw new Error("ssh.hosts must be an array");
  const hosts = (config.hosts ?? []).map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`ssh.hosts[${index}] must be an object`);
    const host = entry as WorkspaceSshHost;
    const port = host.port ?? 22;
    if (typeof host.alias !== "string" || !DNS_LABEL.test(host.alias)) throw new Error(`ssh.hosts[${index}].alias must be a DNS-safe label`);
    if (typeof host.address !== "string" || !host.address.trim()) throw new Error(`ssh.hosts[${index}].address must be non-empty`);
    if (typeof host.user !== "string" || !host.user.trim()) throw new Error(`ssh.hosts[${index}].user must be non-empty`);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`ssh.hosts[${index}].port must be an integer from 1 to 65535`);
    return { alias: host.alias.trim(), address: host.address.trim(), user: host.user.trim(), port };
  });
  return { hosts };
}

function equalHost(a: WorkspaceSshHost, b: WorkspaceSshHost): boolean {
  return a.alias === b.alias && a.address === b.address && a.user === b.user && (a.port ?? 22) === (b.port ?? 22);
}

async function applySshConfig(config: WorkspaceSshConfig, options: WorkspaceApplyContext): Promise<WorkspacePluginResult> {
  const hosts = config.hosts ?? [];
  if (hosts.length === 0) return { changed: false, summary: ["SSH hosts: skipped"], warnings: [] };

  const existingConfig = await readJson<ChatSshConfig>(CHAT_SSH_CONFIG_JSON_PATH, { hosts: [] });
  const nextHosts = [...(Array.isArray(existingConfig.hosts) ? existingConfig.hosts : [])];
  const warnings: string[] = [];
  let added = 0;

  for (const host of hosts.map((h) => ({ ...h, port: h.port ?? 22 }))) {
    const index = nextHosts.findIndex((entry) => entry.alias.toLowerCase() === host.alias.toLowerCase());
    if (index < 0) {
      added++;
      nextHosts.push(host);
      continue;
    }
    if (!equalHost({ ...nextHosts[index], port: nextHosts[index].port ?? 22 }, host)) {
      warnings.push(`SSH alias ${host.alias} already exists with different settings; leaving unchanged.`);
    }
  }

  const changed = added > 0;
  if (!options.dryRun && changed) await writeJson(CHAT_SSH_CONFIG_JSON_PATH, { ...existingConfig, hosts: nextHosts });
  return {
    changed,
    restartRequired: changed,
    summary: [`SSH hosts: ${options.dryRun ? "would add" : changed ? "added" : "already configured"} ${added}; ${hosts.length} requested`],
    warnings,
  };
}

export const sshPlugin: WorkspacePlugin = {
  name: "ssh",
  apply: (ctx) => applySshConfig(parseSshConfig(ctx.config), ctx),
};
