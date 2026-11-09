import assert from 'node:assert/strict';
import { test } from 'node:test';
import { trafficPosition } from '../src/engine/traffic.mjs';

test('차량은 각 차선에서 정해진 방향으로 이동한다', () => {
  const road = { x: 10, z: 20, length: 220, angle: 0 };
  const forward = trafficPosition(road, 0, 6, -3, 5);
  const backward = trafficPosition(road, 0, -6, 3, 5);
  assert.deepEqual([forward.x, forward.z, forward.angle], [40, 17, 0]);
  assert.deepEqual([backward.x, backward.z, backward.angle], [-20, 23, Math.PI]);
  assert.ok(forward.visible && backward.visible);
});

test('회전한 도로에서도 차량이 차선을 따라 움직인다', () => {
  const road = { x: 0, z: 0, length: 220, angle: Math.PI / 2 };
  const a = trafficPosition(road, 0, 4, 3, 0);
  const b = trafficPosition(road, 0, 4, 3, 5);
  assert.ok(Math.abs(a.x - 3) < 1e-9 && Math.abs(b.x - 3) < 1e-9);
  assert.ok(Math.abs(b.z - a.z + 20) < 1e-9);
});

test('도로 끝에서 다시 시작할 때 양쪽 끝을 잠시 감춘다', () => {
  const road = { x: 0, z: 0, length: 220, angle: 0 };
  assert.equal(trafficPosition(road, 95, 1, 2, 0).visible, false);
  assert.equal(trafficPosition(road, 95, 1, 2, 5).visible, false);
  assert.equal(trafficPosition(road, 95, 1, 2, 20).visible, true);
});
