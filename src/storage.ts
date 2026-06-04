import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { DEBUG_LOG_PATH, LAST_APPLY_JSON_PATH } from "./paths.js";
import { readJson, writeJson } from "./json.js";
import type { LastApplyState } from "./types.js";

export async function writeLastApply(state: LastApplyState, path = LAST_APPLY_JSON_PATH): Promise<void> {
  await writeJson(path, state);
}

export async function readLastApply(path = LAST_APPLY_JSON_PATH): Promise<LastApplyState | undefined> {
  return readJson<LastApplyState | undefined>(path, undefined);
}

export async function appendDebugLine(line: string, path = DEBUG_LOG_PATH): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${new Date().toISOString()} ${line}\n`, "utf8");
}
