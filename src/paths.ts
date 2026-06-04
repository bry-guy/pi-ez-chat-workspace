import { homedir } from "node:os";
import { join } from "node:path";

export const CHAT_WORKSPACE_DIR = join(homedir(), ".pi", "agent", "chat-workspace");
export const CONFIG_JSON_PATH = join(CHAT_WORKSPACE_DIR, "config.json");
export const LAST_APPLY_JSON_PATH = join(CHAT_WORKSPACE_DIR, "last-apply.json");
export const BINDINGS_JSON_PATH = join(CHAT_WORKSPACE_DIR, "bindings.json");
export const DEBUG_LOG_PATH = join(CHAT_WORKSPACE_DIR, "debug.log");

export const CHAT_GIT_DIR = join(homedir(), ".pi", "agent", "chat-git");
export const CHAT_GIT_CONVERSATIONS_JSON_PATH = join(CHAT_GIT_DIR, "conversations.json");

export const CHAT_MOUNT_DIR = join(homedir(), ".pi", "agent", "chat-mount");
export const CHAT_MOUNT_CONFIG_JSON_PATH = join(CHAT_MOUNT_DIR, "config.json");
export const CHAT_MOUNT_MOUNTS_JSON_PATH = join(CHAT_MOUNT_DIR, "mounts.json");

export const CHAT_SSH_DIR = join(homedir(), ".pi", "agent", "chat-ssh");
export const CHAT_SSH_CONFIG_JSON_PATH = join(CHAT_SSH_DIR, "config.json");

export const CHAT_NET_DIR = join(homedir(), ".pi", "agent", "chat-net");
export const CHAT_NET_CONFIG_JSON_PATH = join(CHAT_NET_DIR, "config.json");
