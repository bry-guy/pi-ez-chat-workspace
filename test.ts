import assert from "node:assert/strict";

import test from "node:test";
import { parseApplyArgs } from "./src/apply.js";
import { parseWorkspaceConfig } from "./src/config.js";
import { getPersistedConversationId } from "./src/conversation.js";
import { getWorkspacePlugin, registerWorkspacePlugin } from "./src/sdk.js";

test("parses valid workspace config", () => {
  const config = parseWorkspaceConfig({
    workspaces: {
      example: {
        description: "Example",
        git: { enabled: true, identity: "Ada Lovelace <ada@example.com>", noSsh: false },
        mounts: [{ target: "owner/repo", mode: "ro" }],
        ssh: { hosts: [{ alias: "host-a", address: "10.0.0.1", user: "root", port: 22 }] },
      },
    },
  });
  assert.equal((config.workspaces.example.sections.mounts as Array<{ mode: string }>)[0].mode, "ro");
  assert.deepEqual(Object.keys(config.workspaces.example.sections).sort(), ["git", "mounts", "ssh"]);
});

test("rejects invalid profile names", () => {
  assert.throws(() => parseWorkspaceConfig({ workspaces: { " bad": {} } }), /invalid workspace profile name/);
});

test("rejects secret-looking fields", () => {
  assert.throws(() => parseWorkspaceConfig({ workspaces: { example: { token: "nope" } } }), /secret field/);
});

test("extracts latest pi-chat conversation id", () => {
  const id = getPersistedConversationId({
    sessionManager: {
      getEntries: () => [
        { type: "custom", customType: "pi-chat-state", data: { conversationId: "old/channel" } },
        { type: "custom", customType: "pi-chat-state", data: { conversationId: "new/channel" } },
      ],
    },
  });
  assert.equal(id, "new/channel");
});

test("parses apply args", () => {
  assert.deepEqual(parseApplyArgs("example --dry-run --no-reload"), { name: "example", dryRun: true, noReload: true });
  assert.throws(() => parseApplyArgs(""), /Usage/);
});

test("registers workspace plugins globally", () => {
  registerWorkspacePlugin({ name: "unitTestPlugin", apply: () => ({ summary: ["ok"] }) });
  assert.equal(getWorkspacePlugin("unitTestPlugin")?.name, "unitTestPlugin");
});
