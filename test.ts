import assert from "node:assert/strict";

import test from "node:test";
import { parseApplyArgs } from "./src/apply.js";
import { normalizeWorkspaceName, parseWorkspaceProfile, workspaceConfigPath } from "./src/config.js";
import { getPersistedConversationId } from "./src/conversation.js";
import { getWorkspacePlugin, registerWorkspacePlugin } from "./src/sdk.js";

test("parses valid workspace profile", () => {
  const profile = parseWorkspaceProfile({
    description: "Example",
    git: { enabled: true, identity: "Ada Lovelace <ada@example.com>", noSsh: false },
    mounts: [{ target: "owner/repo", mode: "ro" }],
    ssh: { hosts: [{ alias: "host-a", address: "10.0.0.1", user: "root", port: 22 }] },
  });
  assert.equal((profile.sections.mounts as Array<{ mode: string }>)[0].mode, "ro");
  assert.deepEqual(Object.keys(profile.sections).sort(), ["git", "mounts", "ssh"]);
});

test("rejects old workspaces wrapper", () => {
  assert.throws(() => parseWorkspaceProfile({ workspaces: { example: {} } }), /remove the top-level "workspaces" wrapper/);
});

test("rejects invalid workspace names", () => {
  assert.throws(() => normalizeWorkspaceName("-bad"), /invalid workspace name/);
});

test("rejects secret-looking fields", () => {
  assert.throws(() => parseWorkspaceProfile({ token: "nope" }), /secret field/);
});

test("resolves default and named workspace config paths", () => {
  assert.match(workspaceConfigPath(), /chat-workspace\/config\.json$/);
  assert.match(workspaceConfigPath("foo"), /chat-workspace\/foo-config\.json$/);
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
  assert.deepEqual(parseApplyArgs("--dry-run --no-reload"), { dryRun: true, noReload: true });
  assert.deepEqual(parseApplyArgs(""), { dryRun: false, noReload: false });
  assert.throws(() => parseApplyArgs("example"), /Usage/);
});

test("registers workspace plugins globally", () => {
  registerWorkspacePlugin({ name: "unitTestPlugin", apply: () => ({ summary: ["ok"] }) });
  assert.equal(getWorkspacePlugin("unitTestPlugin")?.name, "unitTestPlugin");
});
