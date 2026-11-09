import assert from "node:assert/strict";
import { test } from "node:test";
import { createDailyProvider } from "../server/media/daily.js";

const env = { DAILY_DOMAIN: "harudle-test", DAILY_API_KEY: "not-a-real-key" };
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

test("Daily는 비공개 방과 만료되면 퇴장하는 토큰을 사용한다", async () => {
  const calls = [], expiresAt = Math.floor(Date.now() / 1000) + 300;
  const fetchImpl = async (url, options) => {
    const path = new URL(url).pathname, body = options.body && JSON.parse(options.body);
    calls.push({ path, method: options.method, body });
    if (path.startsWith("/v1/rooms/")) return reply({}, 404);
    if (path === "/v1/rooms") return reply({ name: body.name, privacy: "private", url: `https://${env.DAILY_DOMAIN}.daily.co/${body.name}`, config: body.properties });
    if (path === "/v1/meeting-tokens") return reply({ token: "test-token" });
    throw new Error("unexpected_request");
  };
  const service = createDailyProvider(env, { budget: { reserve: () => ({ expiresAt }) }, fetchImpl });
  const result = await service.join({ identity: "peer-1", name: "크루", area: "12:open", canShare: false });
  const room = calls.find((x) => x.path === "/v1/rooms").body;
  const token = calls.find((x) => x.path === "/v1/meeting-tokens").body.properties;
  assert.equal(room.privacy, "private");
  assert.equal(room.properties.enforce_unique_user_ids, true);
  assert.equal(room.properties.sfu_switchover, 0.5);
  assert.equal(token.eject_at_token_exp, true);
  assert.equal(token.exp, expiresAt);
  assert.equal(token.room_name, room.name);
  assert.deepEqual(token.permissions.canSend, ["audio"]);
  assert.equal(JSON.stringify(result).includes(env.DAILY_API_KEY), false);
});

test("시간을 예약하지 못하면 Daily 토큰을 발급하지 않는다", async () => {
  let issued = 0;
  const fetchImpl = async (url) => {
    if (url.includes("/meeting-tokens")) { issued++; return reply({ token: "test" }); }
    const room = url.split("/").at(-1);
    return reply({ name: room, privacy: "private", url: `https://${env.DAILY_DOMAIN}.daily.co/${room}`, config: { enforce_unique_user_ids: true, sfu_switchover: 0.5 } });
  };
  const service = createDailyProvider(env, { budget: { reserve: () => { throw new Error("budget_exhausted"); } }, fetchImpl });
  await assert.rejects(service.join({ identity: "peer-1", name: "크루", area: "12:open", canShare: false }), /budget_exhausted/);
  assert.equal(issued, 0);
});

test("같은 이름의 기존 방이 안전한 설정이 아니면 사용하지 않는다", async () => {
  const fetchImpl = async (url) => reply({ name: url.split("/").at(-1), privacy: "public", config: {} });
  const service = createDailyProvider(env, { budget: { reserve: () => ({ expiresAt: Math.floor(Date.now() / 1000) + 300 }) }, fetchImpl });
  await assert.rejects(service.join({ identity: "peer-1", name: "크루", area: "12:open", canShare: false }), /daily_room_invalid/);
  assert.equal(createDailyProvider(env).configured, false);
});
