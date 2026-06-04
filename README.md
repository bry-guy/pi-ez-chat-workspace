# pi-ez-chat-workspace

`pi-ez-chat-workspace` binds a pi-chat conversation to a global workspace config and reapplies that workspace on demand.

It is a tiny orchestrator with a plugin registry. Built-in plugins support `git`, `mounts`, `ssh`, and limited `net`; third-party pi extensions can register additional profile sections.

Run `/chat-connect` first.

## Commands

```text
/chat-workspace status
/chat-workspace bind [name]
/chat-workspace unbind
/chat-workspace apply [--dry-run] [--no-reload]
```

- `status` shows the connected conversation's binding and last apply.
- `bind foo` binds the conversation to `foo-config.json` and applies it.
- `bind` or `unbind` uses the default `config.json` workspace.
- `apply` reapplies the currently bound workspace. If you manually changed downstream state, for example with `/chat-unmount`, `apply` restores what the bound workspace declares.

## Config files

Workspace configs live with the other `pi-ez-chat-*` global agent config:

```text
~/.pi/agent/chat-workspace/
├── config.json              # default workspace
├── foo-config.json          # named workspace "foo"
├── bindings.json            # conversation id -> workspace name
├── last-apply.json
└── debug.log
```

This intentionally differs from `pi-ez-worktree`, which uses repo-local `.ez-worktree.json` and `.pi-ez-worktree.json` because worktree config is repository-scoped.

Default `config.json` example:

```json
{
  "description": "Default workspace",
  "git": {
    "enabled": true,
    "identity": "Ada Lovelace <ada@example.com>",
    "noSsh": false
  },
  "mounts": [
    { "target": "owner/repo", "mode": "rw" }
  ],
  "ssh": {
    "hosts": [
      { "alias": "example-a", "address": "10.0.0.10", "user": "root", "port": 22 }
    ]
  },
  "postApplyMessage": "Optional reminder shown after apply"
}
```

Only `description` and `postApplyMessage` are reserved. Every other top-level key is a plugin section. Profiles must not contain secrets.

## Plugin API

Third-party extensions can register sections with the minimal SDK:

```ts
import { registerWorkspacePlugin } from "pi-ez-chat-workspace/sdk";

registerWorkspacePlugin({
  name: "mySection",
  async apply(ctx) {
    // ctx: { workspaceName, conversationId, cwd, dryRun, config }
    return {
      changed: false,
      restartRequired: false,
      summary: ["mySection: ok"],
      warnings: []
    };
  }
});
```

A workspace can then include:

```json
{
  "mySection": { "enabled": true }
}
```

Plugins own validation, writes, and idempotency for their section. Workspace aggregates summaries, writes `last-apply.json`, and schedules one restart if any plugin returns `restartRequired: true`.

## Deferred

Threads should inherit their parent chat's binding, but automatic parent detection is deferred until pi-chat exposes a stable parent id. For now, bind each conversation explicitly when needed.

Also deferred: project-local profiles, per-project discovery, profile inheritance, overlays, pruning, and mutating workspace configs from commands such as `/chat-mount` or `/chat-unmount`.
