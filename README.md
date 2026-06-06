# pi-ez-chat-workspace

## What it does

Binds a pi-chat conversation to a workspace config file and applies it to the connected conversation.

## Why it exists

Setting up git, mounts, ssh, and net by hand for every pi-chat conversation gets tedious fast. A workspace describes that setup once and reapplies it on demand.

## How to use it

New to pi-ez-chat? Start with the [user guide](docs/user-guide.md).

Workspace configs live at `~/.pi/agent/chat-workspace/`:

- `config.json` is the default workspace
- `<name>-config.json` is a named workspace, for example `sideproj-config.json`
- `bindings.json` records which workspace each conversation uses

A workspace file looks like this:

```json
{
  "description": "Default workspace",
  "git": {
    "enabled": true,
    "identity": "Ada Lovelace <ada@example.com>"
  },
  "mounts": [
    { "target": "bry-guy/pi-ez-chat-workspace", "mode": "rw", "includeNodeModules": false }
  ],
  "ssh": {
    "hosts": [
      { "alias": "lab-a", "address": "10.0.0.10", "user": "root", "port": 22 }
    ]
  }
}
```

`description` and `postApplyMessage` are reserved. Every other top-level key is a plugin section. Workspaces do not store secrets.

Connect a conversation first with `/chat-connect`, then use these commands:

- `/chat-workspace status` shows the binding and last apply for the connected conversation.

  ```text
  /chat-workspace status
  ```

- `/chat-workspace bind [name]` binds the conversation to a workspace and applies it. With no name, binds to the default workspace.

  ```text
  /chat-workspace bind sideproj
  /chat-workspace bind
  ```

- `/chat-workspace apply` reapplies the currently bound workspace. Useful after manual changes like `/chat-unmount`.

  ```text
  /chat-workspace apply
  /chat-workspace apply --dry-run
  ```

## Plugin API

Third-party extensions can add workspace sections through a small SDK.

```ts
import { registerWorkspacePlugin } from "pi-ez-chat-workspace/sdk";

registerWorkspacePlugin({
  name: "mySection",
  async apply(ctx) {
    return {
      changed: false,
      restartRequired: false,
      summary: ["mySection: ok"],
    };
  },
});
```

A workspace can then include:

```json
{
  "mySection": { "enabled": true }
}
```

Plugins own validation and writes for their section. Workspace aggregates summaries, writes `last-apply.json`, and reloads the VM once when needed.

Mount entries may set `includeNodeModules: true` when a workspace intentionally needs host dependencies; omitted values default to `false`.
