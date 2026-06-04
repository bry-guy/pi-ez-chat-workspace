import { BINDINGS_JSON_PATH } from "./paths.js";
import { readJson, writeJson } from "./json.js";
import { normalizeWorkspaceName } from "./config.js";
import type { WorkspaceBinding, WorkspaceBindings } from "./types.js";

export async function readBindings(path = BINDINGS_JSON_PATH): Promise<WorkspaceBindings> {
  const parsed = await readJson<WorkspaceBindings>(path, {});
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

export async function writeBindings(bindings: WorkspaceBindings, path = BINDINGS_JSON_PATH): Promise<void> {
  await writeJson(path, bindings);
}

export async function getBinding(conversationId: string): Promise<WorkspaceBinding | undefined> {
  const binding = (await readBindings())[conversationId];
  if (!binding || binding.name === "default") return undefined;
  return binding;
}

export async function effectiveWorkspaceName(conversationId: string): Promise<string> {
  return (await getBinding(conversationId))?.name ?? "default";
}

export async function setBinding(conversationId: string, name: string): Promise<void> {
  const normalized = normalizeWorkspaceName(name);
  const bindings = await readBindings();
  if (normalized === "default") delete bindings[conversationId];
  else bindings[conversationId] = { name: normalized, at: new Date().toISOString() };
  await writeBindings(bindings);
}

export async function clearBinding(conversationId: string): Promise<void> {
  const bindings = await readBindings();
  delete bindings[conversationId];
  await writeBindings(bindings);
}
