import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createStartrack } from '../server/startrack.js'

const crew = { name: '크루', presence: { f: 13, x: 6, y: 24, rm: '' } }

test('사람이 남아 있으면 재생하고 마지막 사람이 나가면 멈춘다', () => {
  let now = 1000, job = null
  const state = createStartrack({
    now: () => now,
    setTimer: (fn) => { job = fn; return 1 },
    clearTimer: () => { job = null },
  })
  state.setPresent('a', true)
  state.setPresent('b', true)
  state.apply({ op: 'set', value: 'dQw4w9WgXcQ', mode: 'video' }, crew)
  state.apply({ op: 'play' }, crew)
  now += 10000
  state.setPresent('a', false)
  assert.equal(state.snapshot().playing, true)
  assert.equal(job, null)
  state.setPresent('b', false)
  assert.ok(job)
  now += 5000
  job()
  assert.equal(state.snapshot().autoPaused, true)
  assert.equal(state.snapshot().position, 15)
  state.setPresent('c', true)
  assert.equal(state.snapshot().playing, true)
})

test('영상 변경과 종료가 같은 영상을 보는 사람에게 일관되게 적용된다', () => {
  const state = createStartrack()
  state.setPresent('a', true)
  state.apply({ op: 'set', value: 'dQw4w9WgXcQ', mode: 'video' }, crew)
  state.apply({ op: 'play' }, crew)
  const changed = state.apply({ op: 'set', value: '4t4AQ15yj1M', mode: 'live' }, crew).state
  assert.equal(changed.videoId, '4t4AQ15yj1M')
  assert.equal(changed.playing, true)
  state.apply({ op: 'ended', videoId: 'dQw4w9WgXcQ', revision: changed.revision - 1 }, crew)
  assert.equal(state.snapshot().playing, true)
  state.apply({ op: 'ended', videoId: changed.videoId, revision: changed.revision }, crew)
  assert.equal(state.snapshot().playing, false)
  state.setPresent('b', true)
  assert.equal(state.snapshot().playing, false)
})

test('끝난 일반 영상을 다시 재생하면 처음부터 시작한다', () => {
  const state = createStartrack()
  state.setPresent('a', true)
  state.apply({ op: 'set', value: 'dQw4w9WgXcQ', mode: 'video' }, crew)
  const playing = state.apply({ op: 'play' }, crew).state
  const ended = state.apply({ op: 'ended', videoId: playing.videoId, revision: playing.revision, position: 90 }, crew).state
  assert.equal(ended.ended, true)
  assert.equal(ended.position, 90)
  const replay = state.apply({ op: 'play' }, crew).state
  assert.equal(replay.position, 0)
  assert.equal(replay.playing, true)
  assert.equal(replay.ended, false)
})
