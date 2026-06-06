import { scheduleCurrentPiChatWorkerRespawn, type RestartScheduleResult } from "pi-ez-lib";

import type { CommandContext } from "./types.js";

export function scheduleCurrentWorkerRespawn(ctx: CommandContext, delaySeconds = 3): RestartScheduleResult {
  return scheduleCurrentPiChatWorkerRespawn(ctx, { delaySeconds });
}
