import { applyWorkspace } from "./apply.js";
import type { CommandContext } from "./types.js";

function splitSubcommand(args: string): { subcommand: string; rest: string } {
  const trimmed = args.trim();
  if (!trimmed) return { subcommand: "", rest: "" };
  const match = trimmed.match(/^(\S+)(?:\s+([\s\S]*))?$/);
  return { subcommand: match?.[1] ?? "", rest: match?.[2] ?? "" };
}

export async function runChatWorkspace(args: string, ctx: CommandContext): Promise<string> {
  const { subcommand, rest } = splitSubcommand(args);
  if (subcommand === "apply") return (await applyWorkspace(rest, ctx)).message;
  throw new Error("Usage: /chat-workspace apply <name> [--dry-run] [--no-reload]");
}
