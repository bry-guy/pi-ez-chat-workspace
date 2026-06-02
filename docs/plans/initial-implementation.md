# pi-ez-chat-workspace — initial implementation plan

## Goal

A pi-chat extension that applies named workspace profiles for a conversation/thread, coordinating the existing `pi-ez-chat-*` extensions so setup becomes one command instead of a sequence of separate commands.

Primary target flow:

```text
/chat-workspace apply homelab
```

That should configure the current connected pi-chat conversation with:

- git identity/auth behavior via `pi-ez-chat-git`
- repository mounts via `pi-ez-chat-mount`
- scoped SSH egress hosts via `pi-ez-chat-ssh`
- scoped network/HTTP egress via `pi-ez-chat-net`, if needed
- one final VM restart/reload prompt/action

This repo should stay generic. No homelab-specific names, hosts, repos, secrets, or vocabulary belong in committed defaults.

## Non-goals

- Do not duplicate the low-level VM wrapper logic from chat-git/chat-mount/chat-ssh/chat-net.
- Do not become a monolithic replacement for the individual extensions.
- Do not store secrets. Workspace profiles may reference non-secret host aliases, repo names, paths, and extension options only.
- Do not inject environment variables unless a downstream extension explicitly owns that behavior.
- Do not hardcode any particular forge, homelab, deployment topology, or repo layout.
- Do not try to verify upstream SSH login by storing or brokering credentials.

## Public surface

```text
/chat-workspace list                 # list configured profiles
/chat-workspace show <name>           # print resolved profile details
/chat-workspace apply <name>          # apply profile to current pi-chat conversation
/chat-workspace status [name]         # compare current/last applied state to profile
/chat-workspace doctor [name]         # validate config, installed extensions, repo resolution hints
/chat-workspace reload                # convenience restart/reload of pi-chat worker/VM
```

`apply` is the main command. It should be safe and idempotent: rerunning the same profile should not duplicate mounts or rewrite unrelated configuration.

## Storage layout

```text
~/.pi/agent/chat-workspace/
├── config.json          # user-edited workspace profiles
├── last-apply.json      # last applied profile summary per conversation; no secrets
└── debug.log
```

The extension also reads/writes downstream extension storage where appropriate, for example:

```text
~/.pi/agent/chat-git/...
~/.pi/agent/chat-mount/...
~/.pi/agent/chat-ssh/config.json
~/.pi/agent/chat-net/...
```

Exact downstream paths should be imported or mirrored carefully from the sibling repos, not guessed in multiple places.

## Config schema (v1 draft)

```jsonc
{
  "workspaces": {
    "example": {
      "description": "Optional human-readable description",

      "git": {
        "enabled": true,
        "identity": "Ada Lovelace <ada@example.com>", // optional
        "noSsh": false                              // optional; maps to chat-git behavior
      },

      "mounts": [
        {
          "target": "owner/repo-a",                 // repo name, owner/repo, URL, or local path
          "mode": "rw"                              // optional: rw | ro; default rw
        },
        {
          "target": "~/dev/repo-b",
          "guestPath": "/repo-b",                   // optional override if chat-mount supports it later
          "mode": "ro"
        }
      ],

      "ssh": {
        "hosts": [
          {
            "alias": "example-a",
            "address": "10.0.0.10",
            "user": "root",
            "port": 22
          }
        ],
        "merge": true                               // default true; append/update chat-ssh config
      },

      "net": {
        "enabled": true,
        "profile": "default",                       // optional, depends on chat-net public surface
        "merge": true
      },

      "postApplyMessage": "Optional reminder shown after apply"
    }
  }
}
```

Schema notes:

- `workspaces` is an object keyed by profile name.
- Profile names should be DNS-ish/simple slugs: `^[A-Za-z0-9][A-Za-z0-9._-]*$`.
- `mounts[].target` is intentionally broad so it can feed the same resolver path as `pi-ez-chat-mount`.
- `ssh.hosts` should use the same validation rules as `pi-ez-chat-ssh`.
- `net` must be finalized after inspecting `pi-ez-chat-net`'s current config and command surface.

## Architecture options

### Preferred: shared library extraction or explicit exported APIs

Long term, each sibling extension should expose small functions that can be reused by workspace:

- `pi-ez-chat-git`: apply/enable config for conversation
- `pi-ez-chat-mount`: resolve and save mount entries
- `pi-ez-chat-ssh`: load/merge/write config and read pubkey status
- `pi-ez-chat-net`: load/merge/write config

Then `pi-ez-chat-workspace` can depend on those packages or a common `pi-ez-lib` without copy/pasting path and storage internals.

### Short-term v1: storage orchestration with compatibility guards

If sibling extensions do not yet export stable APIs, v1 may carefully write their documented storage files directly, with tests locking the expected formats.

Rules for direct storage orchestration:

- Preserve unrelated existing config.
- Add/update only profile-owned entries.
- Never delete user-owned entries unless an explicit `prune` option exists.
- Record what was changed in `last-apply.json`.
- Log warnings when downstream storage has unknown or incompatible shapes.

## Conversation targeting

`apply` must configure the currently connected pi-chat conversation, matching the pattern from `pi-ez-chat-git` and `pi-ez-chat-mount`.

Implementation should copy or import the existing conversation identification helper:

- inspect persisted session entries for the connected pi-chat conversation
- fail with a clear message if no connected conversation exists:

```text
No pi-chat conversation is connected in this session. Run /chat-connect first.
```

## Apply behavior

For `/chat-workspace apply <name>`:

1. Load and validate `~/.pi/agent/chat-workspace/config.json`.
2. Resolve the named profile.
3. Identify the current pi-chat conversation.
4. Validate downstream extension availability/config compatibility.
5. Apply git settings if `profile.git` is present.
6. Resolve and save each requested mount for the conversation.
7. Merge `profile.ssh.hosts` into `~/.pi/agent/chat-ssh/config.json`.
8. Apply/merge net settings if `profile.net` is present.
9. Write `last-apply.json` with profile name, conversation id, counts, changed sections, warnings, and timestamp.
10. Present a concise summary plus next steps:
    - whether a restart is needed
    - whether `/chat-ssh authorized-key` should be run/pasted
    - which repos/hosts/net scopes were configured
11. Schedule a single reload/restart if possible and requested/defaulted.

Suggested result shape:

```text
Applied workspace example for acct/channel.

Git: enabled
Mounts: 3 configured
SSH hosts: 2 configured
Net: enabled

Restarting Gondolin VM.
If SSH was newly configured, run /chat-ssh authorized-key and paste it into each upstream host.
```

## Idempotency and ownership

The hard part is avoiding surprising clobbers. v1 should use conservative ownership markers where possible.

For `last-apply.json`:

```jsonc
{
  "conversationId": "acct/channel",
  "profile": "example",
  "at": "2026-06-01T00:00:00.000Z",
  "git": { "changed": true },
  "mounts": {
    "configured": ["/repo-a", "/repo-b"],
    "skipped": []
  },
  "ssh": {
    "aliases": ["example-a"],
    "newAliases": ["example-a"]
  },
  "net": { "changed": true },
  "warnings": []
}
```

For direct downstream config writes:

- Mount entries are naturally keyed by conversation and guest path.
- SSH entries are keyed by alias; if an alias exists with different address/user/port, warn and keep existing unless `--force` or profile-level `force` is set.
- Git enable should preserve existing identity/env/image unless the profile explicitly sets those fields.
- Net merge rules need to follow chat-net once inspected.

## Commands in detail

### `/chat-workspace list`

Print profile names and descriptions.

### `/chat-workspace show <name>`

Print validated profile details without applying anything. Should include resolved repo targets where possible, but must not clone/install anything unless downstream resolver already does that by design and user asked for it.

### `/chat-workspace apply <name>`

Apply the profile to the current connected conversation. Optional flags to consider:

```text
--no-reload       # configure only; user restarts manually
--force           # allow replacing conflicting profile-owned/downstream entries
--dry-run         # show planned changes without writing
```

For v1, `--dry-run` is highly valuable because this command touches several downstream configs.

### `/chat-workspace status [name]`

Show:

- current conversation id
- last applied profile
- last apply timestamp
- whether configured mounts/SSH hosts are present
- wrapper install status if detectable through downstream status files

### `/chat-workspace doctor [name]`

Check:

- workspace config exists and parses
- profile exists
- pi-ez-chat-git/mount/ssh/net package files or commands appear installed
- current session is connected to pi-chat
- mount targets look resolvable
- SSH host aliases are valid
- SSH public key exists or can be generated by chat-ssh
- reload support available (`TMUX_PANE`) or manual restart required

## Implementation steps

1. **Scaffold package.**
   - `package.json` with `pi` manifest pointing at `./index.ts`.
   - TypeScript config, tests, MIT license, README.
   - Follow `pi-ez-chat-ssh` / `pi-ez-chat-mount` package shape.

2. **Read sibling implementations.**
   - `pi-ez-chat-git`: conversation id, git store format, command wiring.
   - `pi-ez-chat-mount`: mount store format, target resolution, reload scheduling.
   - `pi-ez-chat-ssh`: config schema, merge rules, key status.
   - `pi-ez-chat-net`: public config/command surface and storage format.

3. **Implement config parser.**
   - `src/config.ts` loads `~/.pi/agent/chat-workspace/config.json`.
   - Missing config should produce a clear command error, not silently no-op.
   - Validate profile names, mounts, SSH hosts, git/net sections.

4. **Implement downstream adapters.**
   - `src/adapters/git.ts`
   - `src/adapters/mount.ts`
   - `src/adapters/ssh.ts`
   - `src/adapters/net.ts`

   Each adapter should expose:

   ```ts
   type PlanResult = { changes: string[]; warnings: string[] };
   type ApplyResult = { changed: boolean; summary: string[]; warnings: string[] };
   ```

   And support dry-run.

5. **Implement apply planner.**
   - Convert a profile into an ordered plan.
   - Detect conflicts before writing.
   - In dry-run, print the plan only.

6. **Implement command wiring.**
   - Register `/chat-workspace`.
   - Add remote slash-command interception for chat-originated `/chat-workspace ...`.
   - Reuse fenced-output pattern from siblings.

7. **Implement reload scheduling.**
   - Copy the tmux delayed respawn helper from `pi-ez-chat-mount` / `pi-ez-chat-ssh`.
   - Only restart once after all changes.
   - Respect `--no-reload`.

8. **Tests.**
   - Config parse: valid/invalid profiles.
   - Dry-run plan generation.
   - Apply idempotency.
   - SSH alias conflict behavior.
   - Mount merge behavior.
   - Git preserve-vs-override behavior.
   - Remote slash-command parsing.
   - No secret fields accepted/written.

9. **README.**
   - Explain that this is an orchestrator, not a replacement for individual extensions.
   - Include install commands for sibling packages.
   - Include example generic profile.
   - Document idempotency/conflict rules.

10. **Manual smoke test.**
    - Install all sibling extensions locally.
    - Create a simple profile with one repo and one SSH host.
    - Connect a pi-chat thread.
    - Run `/chat-workspace doctor example`.
    - Run `/chat-workspace apply example --dry-run`.
    - Run `/chat-workspace apply example`.
    - Verify downstream `/chat-git status`, `/chat-mounts`, `/chat-ssh status`, and chat-net status agree.
    - Restart sandbox and confirm mounted repos plus SSH/net access work.

## Open questions

- What is the current `pi-ez-chat-net` storage format and public command surface?
- Should workspace profiles live only globally, or should project-local `.pi/chat-workspace/config.json` also be supported?
- Should apply always restart by default, or default to printing a restart hint?
- Should profiles support `prune: true` to remove entries no longer listed?
- Should mounts support explicit guest path now, or wait until `pi-ez-chat-mount` exposes that as a stable feature?
- Should the workspace extension call sibling slash-command handlers indirectly, or only manipulate storage? Direct function exports would be cleaner but require sibling changes.

## Future work

- Project-local workspace profiles committed with a repo/team.
- Profile composition/inheritance, e.g. `extends: ["base", "deploy"]`.
- A setup wizard that writes the initial config interactively.
- Exported stable adapter APIs in each sibling extension.
- Profile-owned cleanup/prune semantics.
- A single `doctor` report that can be attached to bug reports.
