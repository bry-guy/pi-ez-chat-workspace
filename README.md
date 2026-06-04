# pi-ez-chat-workspace

`pi-ez-chat-workspace` applies a named global workspace profile to the current connected pi-chat conversation.

It is a tiny orchestrator with a plugin registry. Built-in plugins support `git`, `mounts`, `ssh`, and limited `net`; third-party pi extensions can register additional profile sections.

## Command

```text
/chat-workspace apply <name> [--dry-run] [--no-reload]
```

Run `/chat-connect` first.

## Config

Create `~/.pi/agent/chat-workspace/config.json`:

```json
{
  "workspaces": {
    "example": {
      "description": "Example generic workspace",
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
  }
}
```

Only `description` and `postApplyMessage` are reserved. Every other top-level profile key is a plugin section.

Profiles must not contain secrets.

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
  "workspaces": {
    "example": {
      "mySection": { "enabled": true }
    }
  }
}
```

Plugins own validation and writes for their section. Workspace aggregates summaries, writes `last-apply.json`, and prints the shared ``Restart via `/new` for changes to take effect.`` hint if any plugin returns `restartRequired: true`. (Workspace used to schedule a tmux pane respawn here; that path was removed because it killed the user's pi session whenever the connected pane was not a managed pi-chat worker. See [`pi-ez-lib/wishlist.md`](https://github.com/bry-guy/pi-ez-lib/blob/main/wishlist.md) §1 for the upstream extension API we need to do this in place.)

## Deferred

v1 intentionally defers `list`, `show`, `doctor`, project-local profiles, per-project discovery, profile inheritance, overlays, pruning, and ownership tracking beyond simple plugin-owned idempotent merges.
