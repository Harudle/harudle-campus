import assert from "node:assert/strict";
import { test } from "node:test";
import { createCloudflareRecovery } from "../server/media/cloudflare-recovery.js";

test("응답을 잃은 예전 세션은 트랙이 비어 있어도 종료되기 전까지 Cloudflare 연결을 막는다", async () => {
  const rows = [{ session_id: "pending", pending: 1 }, { session_id: "active", pending: 0 }, { session_id: "unknown", pending: 0 }];
  let gone = false, active = true, unknown = true;
  const store = { assertLeadership() {}, externalCloudflareSessions: () => [...rows], closeExternalCloudflareSession: (id) => { rows.splice(rows.findIndex((r) => r.session_id === id), 1); } };
  const client = {
    async inspectSession(id) {
      if (id === "pending") return { gone, tracks: [] };
      if (id === "unknown" && unknown) throw new Error("unavailable");
      return { gone: false, tracks: id === "active" ? [{ mid: "1", status: active ? "active" : "inactive" }] : [] };
    },
    async close() { active = false; },
  };
  const recovery = createCloudflareRecovery({ store, client });
  await assert.rejects(recovery.ensureClear(), /cloudflare_cleanup_required/);
  assert.deepEqual(rows.map((r) => r.session_id), ["pending", "unknown"]);
  gone = true; unknown = false;
  await recovery.ensureClear(); assert.equal(rows.length, 0);
});
