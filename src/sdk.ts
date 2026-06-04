import type { WorkspacePlugin } from "./types.js";

export type { WorkspaceApplyContext, WorkspacePlugin, WorkspacePluginResult } from "./types.js";

const REGISTRY_KEY = Symbol.for("pi-ez-chat-workspace.plugins.v1");

type RegistryGlobal = typeof globalThis & { [REGISTRY_KEY]?: Map<string, WorkspacePlugin> };

function registry(): Map<string, WorkspacePlugin> {
  const global = globalThis as RegistryGlobal;
  global[REGISTRY_KEY] ??= new Map<string, WorkspacePlugin>();
  return global[REGISTRY_KEY];
}

export function registerWorkspacePlugin(plugin: WorkspacePlugin): void {
  if (!plugin.name || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(plugin.name)) throw new Error(`invalid workspace plugin name: ${plugin.name}`);
  registry().set(plugin.name, plugin);
}

export function getWorkspacePlugin(name: string): WorkspacePlugin | undefined {
  return registry().get(name);
}

export function getWorkspacePlugins(): WorkspacePlugin[] {
  return [...registry().values()];
}
