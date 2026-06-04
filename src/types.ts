export type NotifyLevel = "info" | "warning" | "error" | "success";

export type WorkspaceProfile = {
  description?: string;
  postApplyMessage?: string;
  sections: Record<string, unknown>;
};

export type WorkspaceConfig = {
  workspaces: Record<string, WorkspaceProfile>;
};

export type WorkspaceApplyContext = {
  workspaceName: string;
  conversationId: string;
  cwd: string;
  dryRun: boolean;
  config: unknown;
};

export type WorkspacePluginResult = {
  changed?: boolean;
  restartRequired?: boolean;
  summary: string[];
  warnings?: string[];
};

export type WorkspacePlugin = {
  name: string;
  apply(ctx: WorkspaceApplyContext): WorkspacePluginResult | Promise<WorkspacePluginResult>;
};

export type LastApplyState = {
  conversationId: string;
  profile: string;
  at: string;
  summary: Record<string, unknown>;
  warnings: string[];
};

export type CommandContext = {
  cwd: string;
  sessionManager: { getEntries(): unknown[] };
  ui: { notify(message: string, level?: NotifyLevel): void };
};

export type ExtensionAPI = {
  registerCommand(name: string, options: { description?: string; handler(args: string, ctx: CommandContext): unknown | Promise<unknown> }): void;
  on?(event: "input", handler: (event: { text: string; source?: string }, ctx: CommandContext) => unknown | Promise<unknown>): void;
};
