import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createDescriptionSaves } from './topic-description-saves'

// Requests the test settles by hand, in whatever order it likes.
function controlledServer() {
  const calls: { about: unknown; settle: (ok: boolean) => void }[] = []
  const update = (_topicId: string, about: unknown) =>
    new Promise<void>((resolve, reject) => {
      calls.push({
        about,
        settle: (ok) => (ok ? resolve() : reject(new Error('save failed'))),
      })
    })
  return { calls, update }
}
const tick = () => new Promise((r) => setTimeout(r, 0))

test('an editor that mounts mid-save starts from the save', async () => {
  const server = controlledServer()
  const saves = createDescriptionSaves(server.update, () => {})
  const done = saves.save('nfl', 'v1', 'original')
  assert.equal(saves.current('nfl', 'original'), 'v1')
  assert.equal(saves.current('nba', 'nba own'), 'nba own')
  await tick()
  server.calls[0].settle(true)
  await done
  assert.equal(saves.current('nfl', 'original'), 'v1')
})

test("a topic's saves reach the server one at a time, in order", async () => {
  const server = controlledServer()
  const saves = createDescriptionSaves(server.update, () => {})
  const first = saves.save('nfl', 'v1', 'original')
  const second = saves.save('nfl', 'v2', 'original')
  await tick()
  assert.deepEqual(
    server.calls.map((c) => c.about),
    ['v1']
  )
  server.calls[0].settle(true)
  await first
  await tick()
  assert.deepEqual(
    server.calls.map((c) => c.about),
    ['v1', 'v2']
  )
  server.calls[1].settle(true)
  await second
  assert.equal(saves.current('nfl', 'original'), 'v2')
})

test('a failed latest save goes back to the last one the server took', async () => {
  const server = controlledServer()
  let errors = 0
  const saves = createDescriptionSaves(server.update, () => errors++)
  const first = saves.save('nfl', 'v1', 'original')
  const second = saves.save('nfl', 'v2', 'original')
  await tick()
  server.calls[0].settle(true)
  await first
  await tick()
  server.calls[1].settle(false)
  await second
  assert.equal(saves.current('nfl', 'original'), 'v1')
  assert.equal(errors, 1)
})

test('when every save fails, the topic keeps its own description', async () => {
  const server = controlledServer()
  let errors = 0
  const saves = createDescriptionSaves(server.update, () => errors++)
  const first = saves.save('nfl', 'v1', 'original')
  const second = saves.save('nfl', 'v2', 'original')
  await tick()
  server.calls[0].settle(false)
  await first
  // Still the latest save in flight: v1 failing doesn't undo it.
  assert.equal(saves.current('nfl', 'original'), 'v2')
  await tick()
  server.calls[1].settle(false)
  await second
  assert.equal(saves.current('nfl', 'original'), 'original')
  assert.equal(errors, 2)
})

test('an earlier failure behind a later success keeps the later save', async () => {
  const server = controlledServer()
  const saves = createDescriptionSaves(server.update, () => {})
  const first = saves.save('nfl', 'v1', 'original')
  const second = saves.save('nfl', 'v2', 'original')
  await tick()
  server.calls[0].settle(false)
  await first
  await tick()
  server.calls[1].settle(true)
  await second
  assert.equal(saves.current('nfl', 'original'), 'v2')
})
