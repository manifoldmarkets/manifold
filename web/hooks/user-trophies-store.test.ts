import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { EMPTY_STARTER_STATS } from 'common/trophies'
import {
  ANON_VIEWER,
  type UserTrophies,
  createUserTrophiesStore,
} from './user-trophies-store'

// Run: TS_NODE_TRANSPILE_ONLY=1 TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node"}' node -r ts-node/register -r tsconfig-paths/register --test hooks/user-trophies-store.test.ts (from web/)

const OWNER = 'owner-id'
const VISITOR = 'visitor-id'

// get-user-trophies sends the private starter stats to the owner only.
const answerFor = (userId: string, viewerId: string): UserTrophies => ({
  claims: [],
  pins: null,
  league: null,
  season: 1,
  starter: {
    ...EMPTY_STARTER_STATS,
    starterTrades: 4,
    pushEnabled: viewerId === userId ? 1 : 0,
    paidMembership: viewerId === userId ? 1 : 0,
  },
  rewarded: [],
  ranks: [],
  rankPeaks: [],
  ranksComputedTime: null,
  storedPeakNetWorth: null,
})

function setup(viewerId: string = ANON_VIEWER) {
  const session = { viewerId, known: Promise.resolve() as Promise<unknown> }
  const requests: { userId: string; as: string }[] = []
  const saves: { userId: string; pins: string[]; as: string }[] = []
  // When set, responses wait for it: a read or a save still in flight.
  const network: { hold?: Promise<void>; holdSave?: Promise<void> } = {}
  const store = createUserTrophiesStore({
    load: async (userId) => {
      // The server sees whoever is signed in when the request is sent.
      const as = session.viewerId
      requests.push({ userId, as })
      await network.hold
      return answerFor(userId, as)
    },
    savePins: async (userId, pins) => {
      saves.push({ userId, pins, as: session.viewerId })
      await network.holdSave
    },
    getViewerId: () => session.viewerId,
    whenViewerKnown: () => session.known,
    onSaveError: () => {},
  })
  const shown = (userId: string) => store.getSnapshot(store.keyOf(userId))?.data
  const read = (userId: string) => store.load(userId, store.keyOf(userId))
  return { session, requests, saves, network, store, shown, read }
}

describe('user trophies store: one entry per profile and viewer', () => {
  it('keys an entry by the profile and by who is looking at it', () => {
    const { store, session } = setup(OWNER)
    const asOwner = store.keyOf(OWNER)
    assert.equal(asOwner, store.keyOf(OWNER, OWNER))
    session.viewerId = ANON_VIEWER
    const asAnon = store.keyOf(OWNER)
    session.viewerId = VISITOR
    const asVisitor = store.keyOf(OWNER)
    assert.equal(new Set([asOwner, asAnon, asVisitor]).size, 3)
    // A viewer looking at two profiles has two entries.
    assert.notEqual(store.keyOf(OWNER), store.keyOf(VISITOR))
  })

  it("does not show the owner's private stats after sign-out", async () => {
    const { session, requests, shown, read } = setup(OWNER)
    await read(OWNER)
    assert.equal(shown(OWNER)?.starter?.pushEnabled, 1)
    assert.equal(shown(OWNER)?.starter?.paidMembership, 1)

    // Signed out, in this tab or another.
    session.viewerId = ANON_VIEWER
    assert.equal(shown(OWNER), undefined)
    await read(OWNER)
    assert.equal(shown(OWNER)?.starter?.pushEnabled, 0)
    assert.equal(shown(OWNER)?.starter?.paidMembership, 0)
    // Public counts are the same either way.
    assert.equal(shown(OWNER)?.starter?.starterTrades, 4)
    assert.deepEqual(requests, [
      { userId: OWNER, as: OWNER },
      { userId: OWNER, as: ANON_VIEWER },
    ])
  })

  it("does not show a visitor's view to the owner after sign-in", async () => {
    const { session, shown, read } = setup(ANON_VIEWER)
    await read(OWNER)
    assert.equal(shown(OWNER)?.starter?.pushEnabled, 0)

    session.viewerId = OWNER
    // Nothing to show until it has been read as the owner.
    assert.equal(shown(OWNER), undefined)
    await read(OWNER)
    assert.equal(shown(OWNER)?.starter?.pushEnabled, 1)

    // Switching to another account reads again, as a visitor.
    session.viewerId = VISITOR
    assert.equal(shown(OWNER), undefined)
    await read(OWNER)
    assert.equal(shown(OWNER)?.starter?.pushEnabled, 0)
    // Back as the owner, the owner's own entry is there still.
    session.viewerId = OWNER
    assert.equal(shown(OWNER)?.starter?.pushEnabled, 1)
  })

  it('files a read that returns after the viewer changed under the viewer who asked', async () => {
    const { session, network, store, shown, read } = setup(OWNER)
    let release = () => {}
    network.hold = new Promise<void>((resolve) => (release = resolve))
    const inFlight = read(OWNER)
    const ownerKey = store.keyOf(OWNER)

    session.viewerId = ANON_VIEWER
    release()
    await inFlight
    // The owner's answer did not land in the signed-out viewer's entry.
    assert.equal(shown(OWNER), undefined)
    assert.equal(store.getSnapshot(ownerKey)?.data?.starter?.pushEnabled, 1)
  })

  it('tells only the listeners of the entry that changed', async () => {
    const { session, store, read } = setup(OWNER)
    let ownerCalls = 0
    let anonCalls = 0
    const stopOwner = store.subscribe(store.keyOf(OWNER, OWNER), () => {
      ownerCalls++
    })
    const stopAnon = store.subscribe(store.keyOf(OWNER, ANON_VIEWER), () => {
      anonCalls++
    })
    await read(OWNER)
    assert.ok(ownerCalls > 0)
    assert.equal(anonCalls, 0)
    session.viewerId = ANON_VIEWER
    await read(OWNER)
    assert.ok(anonCalls > 0)
    stopOwner()
    stopAnon()
  })

  it('waits to know the viewer before a refresh, then reads as that viewer', async () => {
    const { session, requests, store, shown } = setup(ANON_VIEWER)
    // On page load the session is still being restored.
    let restored = () => {}
    session.known = new Promise<void>((resolve) => (restored = resolve))
    const refreshing = store.refresh(OWNER)
    await Promise.resolve()
    assert.deepEqual(requests, [])

    session.viewerId = OWNER
    restored()
    await refreshing
    assert.deepEqual(requests, [{ userId: OWNER, as: OWNER }])
    assert.equal(shown(OWNER)?.starter?.pushEnabled, 1)
  })

  it("adds a claim to the current viewer's entry, and saves pins as the owner only", async () => {
    const { session, saves, network, store, shown, read } = setup(OWNER)
    await read(OWNER)
    const ownerKey = store.keyOf(OWNER)
    const claim = {
      trophyId: 'starter-trades',
      milestoneId: 'first-trade',
      claimedTime: 1,
    }
    store.addClaims(OWNER, [claim])
    store.addRewards(OWNER, [claim])
    assert.deepEqual(shown(OWNER)?.claims, [claim])
    assert.equal(shown(OWNER)?.rewarded.length, 1)

    // One save in flight and a newer choice waiting behind it.
    let saved = () => {}
    network.holdSave = new Promise<void>((resolve) => (saved = resolve))
    store.setPins(OWNER, ['trophy-starter-trades'])
    store.setPins(OWNER, [])
    assert.deepEqual(saves, [
      { userId: OWNER, pins: ['trophy-starter-trades'], as: OWNER },
    ])

    // The account changes before the waiting choice is sent. It is not sent
    // as the other account, and the owner's entry shows the saved pins again.
    session.viewerId = VISITOR
    saved()
    await store.getSnapshot(ownerKey)?.saving
    assert.equal(saves.length, 1)
    assert.deepEqual(store.getSnapshot(ownerKey)?.data?.pins, [
      'trophy-starter-trades',
    ])
    // None of it reached the other account's entry for this profile.
    assert.equal(shown(OWNER), undefined)
  })
})
