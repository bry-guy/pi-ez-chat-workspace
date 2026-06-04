import type { ExtensionAPI, NotifyLevel } from "./src/types.js";
import { runChatWorkspace } from "./src/commands.js";
import { fenced, matchSlashCommand } from "./src/match.js";
import { registerWorkspacePlugin } from "./src/sdk.js";
import { gitPlugin } from "./src/adapters/git.js";
import { mountsPlugin } from "./src/adapters/mount.js";
import { netPlugin } from "./src/adapters/net.js";
import { sshPlugin } from "./src/adapters/ssh.js";

function notice(ctx: { ui: { notify(message: string, level?: NotifyLevel): void } }, message: string, level: NotifyLevel = "info") {
  ctx.ui.notify(message, level);
}

export default function (pi: ExtensionAPI) {
  registerWorkspacePlugin(gitPlugin);
  registerWorkspacePlugin(mountsPlugin);
  registerWorkspacePlugin(netPlugin);
  registerWorkspacePlugin(sshPlugin);

  pi.registerCommand("chat-workspace", {
    description: "Apply a named pi-chat workspace profile to the connected conversation",
    handler: async (args, ctx) => {
      try {
        notice(ctx, await runChatWorkspace(args, ctx));
      } catch (error) {
        notice(ctx, error instanceof Error ? error.message : String(error), "error");
      }
    },
  });

  pi.on?.("input", async (event, ctx) => {
    const match = matchSlashCommand(event.text, ["chat-workspace"]);
    if (!match) return { action: "continue" };
    try {
      const message = await runChatWorkspace(match.args, ctx);
      return {
        action: "transform",
        text: `The remote /chat-workspace command completed. Reply to the user with exactly this fenced code block and no other text:\n\n${fenced(message)}`,
      };
    } catch (error) {
      return {
        action: "transform",
        text: `The remote /chat-workspace command failed. Reply to the user with exactly this fenced code block and no other text:\n\n${fenced(error instanceof Error ? error.message : String(error))}`,
      };
    }
  });
}
