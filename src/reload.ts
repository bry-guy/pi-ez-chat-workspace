import type { CommandContext } from "./types.js";

export type RestartScheduleResult = { scheduled: boolean; message: string };

/**
 * Compatibility restart hint. Some host installs still resolve an older
 * pi-ez-lib without scheduleCurrentPiChatWorkerRespawn; importing it made
 * /chat-workspace apply fail after writing config. Keep apply reliable and ask
 * the user to run /new until dependency versions are synchronized.
 */
export function scheduleCurrentWorkerRespawn(_ctx: CommandContext, _delaySeconds = 3): RestartScheduleResult {
  return { scheduled: false, message: "Gondolin VM must be restarted. Run /new for changes to take effect." };
}
