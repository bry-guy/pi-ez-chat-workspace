# pi-ez-chat user guide

This guide is for people who want to talk to coding agents in Discord and have those agents do real work on real repositories. It explains what pi-ez-chat is, why it exists, and how to get started without learning every detail up front.

## Why this exists

You want to chat with a coding agent over Discord instead of in a terminal. [pi-chat](https://github.com/earendil-works/pi-chat) connects a pi session to Discord, so the agent reads your messages and replies in a channel.

That gets you a chat, but not real work. To do real work, the agent needs:

- a checkout of your code
- a git identity that matches yours
- network access to the right places
- maybe ssh access to a server

The `pi-ez-chat-*` extensions add those capabilities to pi-chat. `pi-ez-chat-workspace` ties them together so you can describe a workspace once and reuse it across conversations.

## Mental model

A few ideas make everything else click.

- A pi-chat **conversation** is one Discord channel or thread.
- Each conversation runs an agent inside its own **Gondolin sandbox VM**. The VM is what the agent actually controls.
- A **workspace** is a config file that says how the VM should be set up: which repos to mount, which git identity to use, which hosts to allow.
- **Threads** branch a parent conversation into a side conversation. Each thread gets its own tmux worker so it can run in parallel.

Everything else in pi-ez-chat is a smaller piece that fits into this picture.

## The pieces, briefly

These are the extensions you will likely meet. Read the per-repo README for details.

- [pi-ez-chat-git](https://github.com/bry-guy/pi-ez-chat-git): git identity and SSH-agent auth inside the VM.
- [pi-ez-chat-mount](https://github.com/bry-guy/pi-ez-chat-mount): repos to mount into the VM.
- [pi-ez-chat-ssh](https://github.com/bry-guy/pi-ez-chat-ssh): scoped ssh egress to specific upstream hosts.
- [pi-ez-chat-net](https://github.com/bry-guy/pi-ez-chat-net): outbound HTTP/HTTPS allowlist for the VM.
- [pi-ez-chat-threads](https://github.com/bry-guy/pi-ez-chat-threads): named, persistent threads under a parent channel.
- [pi-ez-chat-workspace](https://github.com/bry-guy/pi-ez-chat-workspace): one config that ties the rest together per conversation.

## What happens under the hood

You don't need to track this closely, but a rough picture helps.

- pi-chat connects a pi session to a Discord channel. That session runs in tmux.
- When pi-chat needs an agent, it creates a Gondolin sandbox VM bound to that conversation.
- The per-extension config files under `~/.pi/agent/chat-*` decide how that VM is built. The pieces are applied when the VM is created.
- Starting a thread spawns a new tmux worker for that thread, pointed at its own pi session file and conversation id.
- `pi-ez-chat-workspace` writes the per-extension config files for the connected conversation, then reloads the worker so the VM picks up the changes.

If you need to apply changes, restart the chat sandbox with `/new` in pi-chat, or let workspace reload it for you.

## Getting started

You need pi installed locally and a Discord bot wired up through pi-chat. After that:

1. Install the chat extensions you want.

   ```text
   pi install git:github.com/earendil-works/pi-chat
   pi install git:github.com/bry-guy/pi-ez-chat-workspace
   pi install git:github.com/bry-guy/pi-ez-chat-git
   pi install git:github.com/bry-guy/pi-ez-chat-mount
   pi install git:github.com/bry-guy/pi-ez-chat-ssh
   pi install git:github.com/bry-guy/pi-ez-chat-net
   pi install git:github.com/bry-guy/pi-ez-chat-threads
   ```

2. Configure pi-chat and connect a Discord channel.

   ```text
   /chat-config
   /chat-connect my-account/my-channel
   ```

3. Create a workspace config at `~/.pi/agent/chat-workspace/config.json`.

   ```json
   {
     "description": "Default workspace",
     "git": {
       "enabled": true,
       "identity": "Ada Lovelace <ada@example.com>"
     },
     "mounts": [
       { "target": "bry-guy/pi-ez-chat-workspace", "mode": "rw" }
     ]
   }
   ```

4. Apply the workspace.

   ```text
   /chat-workspace apply
   ```

   The first apply usually triggers a VM reload so the changes take effect.

5. If you added ssh hosts, paste the public key into each upstream:

   ```text
   /chat-ssh authorized-key
   ```

That's the loop. After that, talk to the agent in Discord and it has the repos, identity, and access the workspace described.

## Scenarios

### One channel, one repo, no ssh

The simplest case. Default workspace, one mount.

`~/.pi/agent/chat-workspace/config.json`:

```json
{
  "git": {
    "enabled": true,
    "identity": "Ada Lovelace <ada@example.com>"
  },
  "mounts": [
    { "target": "bry-guy/pi-ez-chat-workspace", "mode": "rw" }
  ]
}
```

Then:

```text
/chat-connect bry-guy/my-channel
/chat-workspace apply
```

### One channel, several repos

Same shape, more mounts.

```json
{
  "git": { "enabled": true, "identity": "Ada Lovelace <ada@example.com>" },
  "mounts": [
    { "target": "bry-guy/pi-ez-chat-workspace", "mode": "rw" },
    { "target": "bry-guy/pi-ez-chat-mount", "mode": "rw" },
    { "target": "bry-guy/pi-ez-chat-ssh", "mode": "rw" }
  ]
}
```

```text
/chat-workspace apply
```

### Switching to a different project

Keep the default workspace for your main project. Add a second workspace for a side project at `~/.pi/agent/chat-workspace/sideproj-config.json`:

```json
{
  "description": "Side project workspace",
  "git": { "enabled": true, "identity": "Ada Lovelace <ada@example.com>" },
  "mounts": [
    { "target": "bry-guy/sideproj", "mode": "rw" }
  ]
}
```

Switch the connected conversation:

```text
/chat-workspace bind sideproj
```

Switch back to default:

```text
/chat-workspace bind
```

`bind` records the binding and applies it. Reapply later with `/chat-workspace apply`.

### Parallel work using threads

Start a named thread from the parent channel:

```text
/chat-thread start fix-bug-123
```

The new thread inherits the parent's mounts and git config at creation time, and runs in its own tmux worker. You and the agent can keep working in the parent channel at the same time.

### Adding ssh access to an internal host

Declare hosts in `~/.pi/agent/chat-ssh/config.json`:

```json
{
  "hosts": [
    { "alias": "lab-a", "address": "10.0.0.10", "user": "root", "port": 22 }
  ]
}
```

Or, the same shape as a workspace section:

```json
{
  "ssh": {
    "hosts": [
      { "alias": "lab-a", "address": "10.0.0.10", "user": "root", "port": 22 }
    ]
  }
}
```

Then:

```text
/chat-workspace apply
/chat-ssh authorized-key
```

Paste the printed key into `~/.ssh/authorized_keys` on each upstream host.

### Limiting outbound HTTP access

In the workspace config:

```json
{
  "net": {
    "enabled": true,
    "allowedHosts": [
      "registry.opentofu.org",
      "*.githubusercontent.com"
    ]
  }
}
```

Reapply and restart the VM. Calls to other hosts will be blocked.

## Quirks worth knowing

- Per-conversation commands need `/chat-connect` first.
- Workspace writes config files. The Gondolin VM picks them up when it is created, so changes usually require a restart. Workspace reloads the worker for you when needed.
- Threads inherit mounts and git config at the moment they start. Later changes to the parent do not propagate to existing threads.
- Workspace does not store secrets. SSH keys live in `chat-ssh`. API tokens live in your own broker.
- `/chat-mount`, `/chat-unmount`, and similar commands change downstream state. They do not edit your workspace config. Reapply with `/chat-workspace apply` to restore what the workspace declares.
- The chat-net allowlist is conservative by design. Broaden it deliberately.

## Troubleshooting

- "No pi-chat conversation is connected" means you skipped `/chat-connect` in this session.
- An ssh host is not reachable: check `/chat-ssh status` and confirm the key is in `authorized_keys` on the upstream.
- A mount is missing inside the VM: run `/chat-mounts` to see configured mounts, then restart the VM.
- Workspace says a section has no plugin: install or enable the extension that provides it.
- Net access is blocked unexpectedly: add the host to `net.allowedHosts` and reapply.

## Where to go next

- Per-repo READMEs for command details.
- The plugin SDK in [`pi-ez-chat-workspace/src/sdk.ts`](../src/sdk.ts) if you want to add your own workspace section.
- [pi-chat](https://github.com/earendil-works/pi-chat) for the chat layer this all sits on.
