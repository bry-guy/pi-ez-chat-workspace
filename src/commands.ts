import { bindAndApplyWorkspace, applyWorkspace } from "./apply.js";
import { clearBinding, getBinding, effectiveWorkspaceName } from "./bindings.js";
import { loadWorkspaceProfile } from "./config.js";
import { requireConversationId } from "./conversation.js";
import { readLastApply } from "./storage.js";
import type { CommandContext } from "./types.js";

function splitSubcommand(args: string): { subcommand: string; rest: string } {
  const trimmed = args.trim();
  if (!trimmed) return { subcommand: "status", rest: "" };
  const match = trimmed.match(/^(\S+)(?:\s+([\s\S]*))?$/);
  return { subcommand: match?.[1] ?? "status", rest: match?.[2] ?? "" };
}

async function statusWorkspace(ctx: CommandContext): Promise<string> {
  const conversationId = requireConversationId(ctx);
  const explicit = await getBinding(conversationId);
  const workspaceName = await effectiveWorkspaceName(conversationId);
  const { path, profile } = await loadWorkspaceProfile(workspaceName);
  const lastApply = await readLastApply();
  const lines: string[] = [];
  lines.push(`conversation: ${conversationId}`);
  lines.push(`workspace: ${workspaceName}${explicit ? " (explicit binding)" : " (default)"}`);
  lines.push(`config: ${path}`);
  if (profile.description) lines.push(`description: ${profile.description}`);
  lines.push(`sections: ${Object.keys(profile.sections).sort().join(", ") || "none"}`);
  if (lastApply?.conversationId === conversationId) {
    lines.push(`last apply: ${lastApply.profile} at ${lastApply.at}`);
    lines.push(`last apply config: ${lastApply.workspaceFile ?? "unknown"}`);
    if ((lastApply.warnings ?? []).length > 0) lines.push(`warnings: ${(lastApply.warnings ?? []).join("; ")}`);
  } else {
    lines.push("last apply: never for this conversation");
  }
  return lines.join("\n");
}

async function unbindWorkspace(ctx: CommandContext): Promise<string> {
  const conversationId = requireConversationId(ctx);
  await clearBinding(conversationId);
  const result = await applyWorkspace("", ctx);
  return `Removed explicit workspace binding for ${conversationId}; using default.\n\n${result.message}`;
}

export async function runChatWorkspace(args: string, ctx: CommandContext): Promise<string> {
  const { subcommand, rest } = splitSubcommand(args);
  if (subcommand === "apply") return (await applyWorkspace(rest, ctx)).message;
  if (subcommand === "bind") return (await bindAndApplyWorkspace(rest, ctx)).message;
  if (subcommand === "unbind") return unbindWorkspace(ctx);
  if (subcommand === "status") return statusWorkspace(ctx);
  throw new Error("Usage: /chat-workspace [status|bind [name]|unbind|apply [--dry-run] [--no-reload]]");
}
