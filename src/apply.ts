import { CHAT_VM_RESTART_HINT } from "pi-ez-lib";
import { getProfile, loadWorkspaceConfig } from "./config.js";
import { requireConversationId } from "./conversation.js";
import { writeLastApply } from "./storage.js";
import { getWorkspacePlugin } from "./sdk.js";
import type { CommandContext, LastApplyState, WorkspacePluginResult } from "./types.js";

export type ApplyArgs = { name: string; dryRun: boolean; noReload: boolean };

export function parseApplyArgs(args: string): ApplyArgs {
  const tokens = args.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map((t) => t.replace(/^['"]|['"]$/g, "")) ?? [];
  let name = "";
  let dryRun = false;
  let noReload = false;
  for (const token of tokens) {
    if (token === "--dry-run") dryRun = true;
    else if (token === "--no-reload") noReload = true;
    else if (token.startsWith("-")) throw new Error("Usage: /chat-workspace apply <name> [--dry-run] [--no-reload]");
    else if (!name) name = token;
    else throw new Error("Usage: /chat-workspace apply <name> [--dry-run] [--no-reload]");
  }
  if (!name) throw new Error("Usage: /chat-workspace apply <name> [--dry-run] [--no-reload]");
  return { name, dryRun, noReload };
}

export async function applyWorkspace(rawArgs: string, ctx: CommandContext): Promise<{ message: string; changed: boolean; warnings: string[] }> {
  const args = parseApplyArgs(rawArgs);
  const config = await loadWorkspaceConfig();
  const profile = getProfile(config, args.name);
  const conversationId = requireConversationId(ctx);

  const results: Array<{ section: string; result: WorkspacePluginResult }> = [];
  for (const [section, sectionConfig] of Object.entries(profile.sections)) {
    const plugin = getWorkspacePlugin(section);
    if (!plugin) throw new Error(`Workspace section "${section}" has no registered plugin. Install/enable the extension that provides it.`);
    const result = await plugin.apply({ workspaceName: args.name, conversationId, cwd: ctx.cwd, dryRun: args.dryRun, config: sectionConfig });
    results.push({ section, result });
  }

  const warnings = results.flatMap(({ result }) => result.warnings ?? []);
  const changed = results.some(({ result }) => result.changed);
  const restartRequired = results.some(({ result }) => result.restartRequired);
  const lines: string[] = [];
  lines.push(`${args.dryRun ? "Dry run for" : "Applied"} workspace ${args.name} ${args.dryRun ? "on" : "for"} ${conversationId}.`);
  lines.push("");
  for (const { result } of results) lines.push(...result.summary);
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
      profile: args.name,
      at: new Date().toISOString(),
      summary: Object.fromEntries(results.map(({ section, result }) => [section, { changed: Boolean(result.changed), restartRequired: Boolean(result.restartRequired), summary: result.summary }])),
      warnings,
    };
    await writeLastApply(state);
  }

  if (args.dryRun) {
    lines.push("");
    lines.push(restartRequired ? `Would print: ${CHAT_VM_RESTART_HINT}` : "No VM restart would be needed.");
  } else if (restartRequired) {
    lines.push("");
    lines.push(CHAT_VM_RESTART_HINT);
  }

  if (profile.sections.ssh) {
    lines.push("");
    lines.push("If SSH was newly configured, run /chat-ssh authorized-key and paste it into each upstream host.");
  }

  return { message: lines.join("\n"), changed, warnings };
}
