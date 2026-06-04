# pi-ez-chat-workspace — binding model implementation plan

## Decision

`pi-ez-chat-workspace` should not be project-local. It should be scoped to pi-chat conversations and stored with the other `pi-ez-chat-*` global agent config.

The right model is:

- workspace config files are reusable global recipes
- each pi-chat conversation has an effective binding to one recipe
- missing binding means the default recipe
- `apply` reapplies the currently bound recipe
- `bind` changes the binding and applies
- threads should eventually inherit bindings from their parent chat

This preserves reuse while making the main pi-chat session naturally use a workspace by default.

## Storage

```text
~/.pi/agent/chat-workspace/
├── config.json              # default workspace
├── <name>-config.json       # named workspaces, e.g. foo-config.json
├── bindings.json            # conversationId -> { name, at }
├── last-apply.json
└── debug.log
```

This aligns with the chat extension family:

```text
~/.pi/agent/chat-git/
~/.pi/agent/chat-mount/
~/.pi/agent/chat-ssh/
~/.pi/agent/chat-net/
~/.pi/agent/chat-workspace/
```

It intentionally does **not** copy `pi-ez-worktree`'s repo-local naming. `pi-ez-worktree` uses `.ez-worktree.json` and `.pi-ez-worktree.json` because those files are repository/worktree scoped. Chat workspaces are conversation scoped, with global reusable configs.

## Workspace config schema

A config file describes exactly one workspace. There is no outer `workspaces` map.

```jsonc
{
  "description": "Default workspace",

  "git": {
    "enabled": true,
    "identity": "Ada Lovelace <ada@example.com>",
    "noSsh": false
  },

  "mounts": [
    { "target": "owner/repo-a", "mode": "rw" },
    { "target": "~/dev/repo-b", "mode": "ro" }
  ],

  "ssh": {
    "hosts": [
      { "alias": "example-a", "address": "10.0.0.10", "user": "root", "port": 22 }
    ]
  },

  "thirdPartySection": {
    "enabled": true
  },

  "postApplyMessage": "Optional reminder shown after apply"
}
```

Only two keys are reserved by workspace core:

- `description`
- `postApplyMessage`

Every other top-level key is a plugin-owned section.

Core validation stays minimal:

- file parses as JSON object
- section names are simple slugs
- no obvious secret-looking keys are present
- old top-level `workspaces` wrapper is rejected with a migration hint

Plugin-specific validation happens inside plugin `apply`, including during `--dry-run`.

## Bindings

`bindings.json` maps conversation ids to explicit named workspaces:

```jsonc
{
  "acct/channel-a": { "name": "foo", "at": "2026-06-01T00:00:00.000Z" }
}
```

Rules:

- missing entry means `default`
- `default` resolves to `config.json`
- `foo` resolves to `foo-config.json`
- binding to `default` removes the explicit binding
- bindings are not modified by `/chat-mount`, `/chat-unmount`, or other downstream commands

## Commands

```text
/chat-workspace status
/chat-workspace bind [name]
/chat-workspace unbind
/chat-workspace apply [--dry-run] [--no-reload]
```

Semantics:

- `status`: show current conversation id, effective workspace, config file, sections, and last apply
- `bind foo`: validate `foo-config.json`, bind current conversation to `foo`, then apply
- `bind`: bind to default `config.json`, then apply
- `unbind`: remove explicit binding, then apply default
- `apply`: reapply currently bound workspace

`apply` no longer accepts a workspace name. Changing workspaces is `bind`.

## Plugin API

Use one global registry and one required method.

```ts
export type WorkspacePlugin = {
  name: string;
  apply(ctx: WorkspaceApplyContext): WorkspacePluginResult | Promise<WorkspacePluginResult>;
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

export function registerWorkspacePlugin(plugin: WorkspacePlugin): void;
export function getWorkspacePlugin(name: string): WorkspacePlugin | undefined;
export function getWorkspacePlugins(): WorkspacePlugin[];
```

The registry uses:

```ts
Symbol.for("pi-ez-chat-workspace.plugins.v1")
```

so independent packages can share it even if they import their own copy of the SDK.

No optional `validate`, `show`, or `doctor` methods are needed for MVP.

## Apply behavior

For `/chat-workspace apply`:

1. Identify the current connected pi-chat conversation.
2. Resolve its effective workspace binding.
3. Load `config.json` or `<name>-config.json`.
4. For each non-reserved profile key:
   - find a registered plugin with the same `name`
   - fail clearly if none is registered
   - call `plugin.apply({ workspaceName, conversationId, cwd, dryRun, config })`
5. Aggregate summaries and warnings.
6. Write lightweight `last-apply.json` unless `--dry-run`.
7. Schedule one reload unless `--dry-run`, `--no-reload`, or no plugin returned `restartRequired`.

Plugins must not restart the VM themselves. They report `restartRequired: true`; workspace performs one restart after all sections run.

Reapply semantics are intentional: if a user manually removes downstream state, for example via `/chat-unmount`, `/chat-workspace apply` restores what the bound workspace declares.

## Conversation targeting

`apply`, `bind`, `unbind`, and `status` require the currently connected pi-chat conversation.

If no connected conversation exists, fail with:

```text
No pi-chat conversation is connected in this session. Run /chat-connect first.
```

## Thread inheritance

Desired future behavior:

- when a new chat thread is created, it inherits the parent conversation's binding
- inherited bindings are stored as normal entries in `bindings.json`, possibly with `inheritedFrom`
- if the parent has no explicit binding, the child uses default

Implementation is deferred until pi-chat exposes a stable parent conversation id in session state. The binding storage shape is compatible with this future behavior.

## Non-goals for v1

- No project-local workspace configs.
- No per-project workspace discovery.
- No automatic workspace selection by repository.
- No profile inheritance/composition/overlays.
- No pruning.
- No mutation of workspace config files from downstream commands.
- No plugin optional methods beyond `apply`.

## Implementation steps

1. Add workspace file resolver:
   - default -> `config.json`
   - `foo` -> `foo-config.json`
2. Change parser so each file is one workspace profile.
3. Add `bindings.json` helpers.
4. Update `apply` to load the effective binding.
5. Add `bind`, `unbind`, and `status` commands.
6. Keep built-in `git`, `mounts`, `ssh`, and `net` integrations as plugins.
7. Update tests for new parser, binding/path resolution, and apply args.
8. Update README.

## Manual smoke test

1. Create `~/.pi/agent/chat-workspace/config.json`.
2. Optionally create `~/.pi/agent/chat-workspace/foo-config.json`.
3. Connect a pi-chat thread.
4. Run `/chat-workspace status`.
5. Run `/chat-workspace apply --dry-run`.
6. Run `/chat-workspace bind foo`.
7. Verify downstream `/chat-git status`, `/chat-mounts`, `/chat-ssh status`, and chat-net status if applicable.
8. Run `/chat-unmount <repo>`, then `/chat-workspace apply`, and verify the mount is restored.
