export function getPersistedConversationId(ctx: { sessionManager: { getEntries(): unknown[] } }): string | undefined {
  const entries = ctx.sessionManager.getEntries();
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index] as Record<string, unknown>;
    if (entry.type !== "custom" || entry.customType !== "pi-chat-state") continue;
    const data = entry.data as { conversationId?: unknown } | undefined;
    if (typeof data?.conversationId === "string" && data.conversationId.trim()) return data.conversationId;
    return undefined;
  }
  return undefined;
}

export function requireConversationId(ctx: { sessionManager: { getEntries(): unknown[] } }): string {
  const id = getPersistedConversationId(ctx);
  if (!id) throw new Error("No pi-chat conversation is connected in this session. Run /chat-connect first.");
  return id;
}
