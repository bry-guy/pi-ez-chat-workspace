# pi-ez-chat-workspace — initial implementation plan

## Goal

A tiny pi-chat extension that applies one named global workspace profile to the current connected pi-chat conversation/thread.

Primary flow:

```text
/chat-workspace apply example
```

The core extension should coordinate workspace application and stay generic. Built-in plugins support the current `pi-ez-chat-*` family:

- `git` via `pi-ez-chat-git`
- `mounts` via `pi-ez-chat-mount`
- `ssh` via `pi-ez-chat-ssh`
- limited `net` via `pi-ez-chat-net` when explicit `allowedHosts` are provided

Third-party pi extensions should be able to add new workspace sections by registering plugins.

No homelab-specific names, hosts, repos, secrets, or vocabulary belong in committed defaults.

## MVP public surface

```text
/chat-workspace apply <name> [--dry-run] [--no-reload]
```

Everything else is deferred for now. In particular, v1 does not need:

- `/chat-workspace list`
- `/chat-workspace show`
- `/chat-workspace doctor`
- `/chat-workspace status`
- `/chat-workspace reload`
- `--force`
- pruning

## Non-goals for v1

- Do not duplicate low-level VM wrapper logic from chat-git/chat-mount/chat-ssh/chat-net.
- Do not become a monolithic replacement for the individual extensions.
- Do not store secrets.
- Do not inject environment variables unless a downstream/plugin extension explicitly owns that behavior.
- Do not hardcode any particular forge, homelab, deployment topology, or repo layout.
- Do not implement project-local or per-project workspace config.
- Do not implement multi-workspace concepts beyond selecting one named global profile.

## Explicitly deferred

Defer multi-workspace concepts such as:

- project-local `.pi/chat-workspace/config.json`
- per-project workspace discovery
- automatically choosing a workspace based on the current repository
- workspace profile inheritance, composition, or overlays
- pruning entries that are no longer present in a profile
- ownership tracking beyond basic plugin-owned idempotent merge behavior
- rich status/doctor/show commands

## Storage layout

```text
~/.pi/agent/chat-workspace/
├── config.json          # user-edited global workspace profiles
├── last-apply.json      # lightweight last applied summary; no secrets
└── debug.log            # optional debug output
```

Plugins may read/write their own extension storage. The workspace core should not know about non-built-in plugin storage.

## Config model

Only two profile fields are reserved by workspace core:

- `description`
- `postApplyMessage`

Every other top-level profile key is a plugin-owned section.

```jsonc
{
  "workspaces": {
    "example": {
      "description": "Optional human-readable description",

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
  }
}
```

Core validation should stay minimal:

- config parses as JSON
- `workspaces` is an object
- profile name exists and is a simple slug
- profile section names are simple slugs
- no obvious secret-looking keys are present

Plugin-specific validation happens inside plugin `apply`, including during `--dry-run`.

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

The registry should use:

```ts
Symbol.for("pi-ez-chat-workspace.plugins.v1")
```

so independent packages can share it even if they import their own copy of the SDK.

No optional `validate`, `show`, or `doctor` methods are needed for MVP.

## Apply behavior

For `/chat-workspace apply <name>`:

1. Load `~/.pi/agent/chat-workspace/config.json`.
2. Resolve the named profile.
3. Identify the current connected pi-chat conversation.
4. For each non-reserved profile key:
   - find a registered plugin with the same `name`
   - fail clearly if none is registered
   - call `plugin.apply({ workspaceName, conversationId, cwd, dryRun, config })`
5. Aggregate summaries and warnings.
6. Write lightweight `last-apply.json` unless `--dry-run`.
7. If any plugin returned `restartRequired: true`, append the shared ``Restart via `/new` for changes to take effect.`` hint to the apply output. Workspace no longer schedules an automatic tmux respawn; see `pi-ez-lib/wishlist.md` §1. (`--no-reload` is still accepted for backwards compatibility but is now a no-op.)

Plugins must not restart the VM themselves. They report `restartRequired: true`; workspace surfaces a single `/new` hint after all sections run.

## Conversation targeting

`apply` must configure the currently connected pi-chat conversation, matching the pattern from sibling extensions.

If no connected conversation exists, fail with:

```text
No pi-chat conversation is connected in this session. Run /chat-connect first.
```

## Built-in plugins

The built-in integrations use the same plugin API as third-party extensions:

```ts
registerWorkspacePlugin(gitPlugin);
registerWorkspacePlugin(mountsPlugin);
registerWorkspacePlugin(sshPlugin);
registerWorkspacePlugin(netPlugin);
```

No special orchestration paths should exist for built-ins.

## Idempotency and conflicts

Keep v1 simple and plugin-owned:

- Built-in mounts should not duplicate entries.
- Built-in SSH hosts should be keyed by alias.
- Existing conflicting SSH aliases and mounts should be preserved and warned about.
- Built-in git config should preserve existing fields unless explicitly set.
- Third-party plugins own their own idempotency.

No `--force` and no pruning in v1.

## `last-apply.json`

Use this as a lightweight summary only. Do not use it as an ownership database.

```jsonc
{
  "conversationId": "acct/channel",
  "profile": "example",
  "at": "2026-06-01T00:00:00.000Z",
  "summary": {
    "git": { "changed": true, "restartRequired": true, "summary": ["Git: configured"] }
  },
  "warnings": []
}
```

## Implementation steps

1. Scaffold pi package.
2. Add minimal SDK/registry using `Symbol.for`.
3. Implement config loader that preserves raw plugin sections.
4. Implement conversation helper.
5. Convert built-in git/mounts/ssh/net adapters into plugins.
6. Implement `/chat-workspace apply` orchestration.
7. Aggregate `restartRequired` across plugins and surface the shared `/new` hint once after all plugin results.
8. Add tests for config parsing, plugin registration, apply args, and conversation detection.
9. Update README with plugin API and deferred features.

## Manual smoke test

1. Install all sibling extensions locally.
2. Create a simple generic profile with one repo and one SSH host.
3. Connect a pi-chat thread.
4. Run `/chat-workspace apply example --dry-run`.
5. Run `/chat-workspace apply example`.
6. Verify downstream `/chat-git status`, `/chat-mounts`, `/chat-ssh status`, and chat-net status if applicable.
7. Restart sandbox and confirm mounted repos plus SSH access work.

## Future work

- `/chat-workspace list`, `show`, `doctor`, and `status`.
- Project-local workspace profiles committed with a repo/team.
- Per-project workspace discovery.
- Profile composition/inheritance.
- Profile-owned cleanup/prune semantics.
- `--force` for explicit conflict replacement.
- A setup wizard that writes the initial config interactively.
- Optional plugin methods if proven necessary later.
