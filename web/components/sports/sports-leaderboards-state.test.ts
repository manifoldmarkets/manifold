import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HOUR_MS, MINUTE_MS } from 'common/util/time'
import {
  boardStatus,
  isDelayed,
  shouldRefresh,
} from './sports-leaderboards-state'

const now = Date.UTC(2026, 9, 29, 12)
const built = { updatedTime: now - 12 * MINUTE_MS }
const missing = { updatedTime: null }
const failure = new Error('request failed')

test('nothing shows as failed before the request has an answer', () => {
  // The first render, before the request starts, with or without an error
  // cached from an earlier visit.
  assert.equal(boardStatus(undefined, undefined, false), 'loading')
  assert.equal(boardStatus(undefined, failure, false), 'loading')
  assert.equal(boardStatus(missing, undefined, false), 'loading')
  // In flight: the hook clears the error when a request starts.
  assert.equal(boardStatus(undefined, undefined, true), 'loading')
})

test('a failed request shows as failed, and built boards outlast one', () => {
  assert.equal(boardStatus(undefined, failure, true), 'failed')
  assert.equal(boardStatus(missing, failure, true), 'failed')
  assert.equal(boardStatus(built, failure, true), 'built')
  assert.equal(boardStatus(built, undefined, false), 'built')
})

test('an answer with no boards is told apart from a failure', () => {
  assert.equal(boardStatus(missing, undefined, true), 'notYet')
})

test('a failed request retries at the next check, not on mount', () => {
  const failed = { updatedTime: undefined, error: failure, loading: false }
  assert.equal(shouldRefresh({ ...failed, tick: 0, now }), false)
  assert.equal(shouldRefresh({ ...failed, tick: 1, now }), true)
  assert.equal(shouldRefresh({ ...failed, tick: 7, now }), true)
  // Not while the retry is in flight.
  assert.equal(shouldRefresh({ ...failed, loading: true, tick: 1, now }), false)
})

test('boards refresh when over an hour old or not built yet', () => {
  const ok = { error: undefined, loading: false, tick: 0, now }
  assert.equal(shouldRefresh({ ...ok, updatedTime: null }), true)
  assert.equal(
    shouldRefresh({ ...ok, updatedTime: now - HOUR_MS - MINUTE_MS }),
    true
  )
  assert.equal(shouldRefresh({ ...ok, updatedTime: built.updatedTime }), false)
  assert.equal(shouldRefresh({ ...ok, updatedTime: undefined }), false)
})

test('boards are delayed once a rebuild is overdue', () => {
  assert.equal(isDelayed(now - 59 * MINUTE_MS, now), false)
  assert.equal(isDelayed(now - 90 * MINUTE_MS, now), false)
  assert.equal(isDelayed(now - 91 * MINUTE_MS, now), true)
  assert.equal(isDelayed(now - 5 * HOUR_MS, now), true)
})
