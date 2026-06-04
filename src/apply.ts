import { effectiveWorkspaceName, setBinding } from "./bindings.js";
import { loadWorkspaceProfile, normalizeWorkspaceName } from "./config.js";
import { requireConversationId } from "./conversation.js";
import { scheduleCurrentTmuxPaneRespawn } from "./reload.js";
import { writeLastApply } from "./storage.js";
import { getWorkspacePlugin } from "./sdk.js";
import type { CommandContext, LastApplyState, WorkspacePluginResult } from "./types.js";

export type ApplyArgs = { dryRun: boolean; noReload: boolean };

export function parseApplyArgs(args: string): ApplyArgs {
  const tokens = args.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map((t) => t.replace(/^['"]|['"]$/g, "")) ?? [];
  let dryRun = false;
  let noReload = false;
  for (const token of tokens) {
    if (token === "--dry-run") dryRun = true;
    else if (token === "--no-reload") noReload = true;
    else throw new Error("Usage: /chat-workspace apply [--dry-run] [--no-reload]");
  }
  return { dryRun, noReload };
}

export async function applyWorkspace(rawArgs: string, ctx: CommandContext): Promise<{ message: string; changed: boolean; warnings: string[] }> {
  return applyResolvedWorkspace(parseApplyArgs(rawArgs), ctx);
}

export async function bindAndApplyWorkspace(rawName: string, ctx: CommandContext): Promise<{ message: string; changed: boolean; warnings: string[] }> {
  const conversationId = requireConversationId(ctx);
  const name = normalizeWorkspaceName(rawName.trim() || "default");
  // Load first so a typo does not rewrite the binding to a missing workspace.
  await loadWorkspaceProfile(name);
  await setBinding(conversationId, name);
  const result = await applyResolvedWorkspace({ dryRun: false, noReload: false }, ctx, name);
  return { ...result, message: `Bound ${conversationId} to workspace ${name}.\n\n${result.message}` };
}

async function applyResolvedWorkspace(
  args: ApplyArgs,
  ctx: CommandContext,
  explicitWorkspaceName?: string,
): Promise<{ message: string; changed: boolean; warnings: string[] }> {
  const conversationId = requireConversationId(ctx);
  const workspaceName = explicitWorkspaceName ?? (await effectiveWorkspaceName(conversationId));
  const { path, profile } = await loadWorkspaceProfile(workspaceName);

  const results: Array<{ section: string; result: WorkspacePluginResult }> = [];
  for (const [section, sectionConfig] of Object.entries(profile.sections)) {
    const plugin = getWorkspacePlugin(section);
    if (!plugin) throw new Error(`Workspace section "${section}" has no registered plugin. Install/enable the extension that provides it.`);
    const result = await plugin.apply({ workspaceName, conversationId, cwd: ctx.cwd, dryRun: args.dryRun, config: sectionConfig });
    results.push({ section, result });
  }

  const warnings = results.flatMap(({ result }) => result.warnings ?? []);
  const changed = results.some(({ result }) => result.changed);
  const restartRequired = results.some(({ result }) => result.restartRequired);
  const lines: string[] = [];
  lines.push(`${args.dryRun ? "Dry run for" : "Applied"} workspace ${workspaceName} ${args.dryRun ? "on" : "for"} ${conversationId}.`);
  lines.push(`Config: ${path}`);
  lines.push("");
  for (const { result } of results) lines.push(...result.summary);
  if (results.length === 0) lines.push("No plugin sections configured.");
  if (warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    for (const warning of warnings) lines.push(`- ${warning}`);
  }
  if (profile.postApplyMessage) {
    lines.push("");
    lines.push(profile.postApplyMessage);
  }

  if (!args.dryRun) {
    const state: LastApplyState = {
      conversationId,
      profile: workspaceName,
      workspaceFile: path,
      at: new Date().toISOString(),
      summary: Object.fromEntries(results.map(({ section, result }) => [section, { changed: Boolean(result.changed), restartRequired: Boolean(result.restartRequired), summary: result.summary }])),
      warnings,
    };
    await writeLastApply(state);
  }

  if (args.dryRun) {
    lines.push("");
    lines.push(args.noReload ? "Would not reload VM (--no-reload)." : restartRequired ? "Would reload VM after apply." : "No reload would be needed.");
  } else if (args.noReload) {
    if (restartRequired) {
      lines.push("");
      lines.push("Gondolin VM must be restarted. Skipped auto-reload because --no-reload was set.");
    }
  } else if (restartRequired) {
    const restart = scheduleCurrentTmuxPaneRespawn(3);
    lines.push("");
    lines.push(restart.message);
  }

  if (profile.sections.ssh) {
    lines.push("");
    lines.push("If SSH was newly configured, run /chat-ssh authorized-key and paste it into each upstream host.");
  }

  return { message: lines.join("\n"), changed, warnings };
}
