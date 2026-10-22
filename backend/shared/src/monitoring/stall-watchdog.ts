import { Worker } from 'worker_threads'
import { log } from 'shared/utils'
import { CpuProfile, summarizeCpuProfile } from './cpu-profile-summary'

// Captures what the main thread is doing while its event loop is blocked.
//
// The lag sampler in metric-writer.ts can only say that a stall happened, after
// it ends. This watchdog runs in a worker thread, which keeps running while the
// main thread is stuck. The main thread bumps a shared heartbeat counter; when
// the counter stops moving for STALL_CAPTURE_MS, the worker attaches to the
// main thread's inspector and runs the V8 CPU profiler until the heartbeat
// moves again. Inspector commands are delivered to a main thread busy in JS by
// a V8 interrupt, so the profiler starts mid-stall, not after it. A thread
// stuck in native code (a blocking syscall) only services them once it
// returns. The profile comes back to the main thread, which logs the hottest
// stacks once it is free.
//
// We use the profiler, never Debugger.pause: nothing here can leave the main
// thread paused.

const HEARTBEAT_MS = 100
const POLL_MS = 250
const STALL_CAPTURE_MS = 2_000
// How long the worker keeps profiling a stall that hasn't ended. Best effort:
// stopping the profiler is itself an inspector command the main thread has to
// service, so a thread stuck in native code is only stopped once it returns.
const MAX_PROFILE_MS = 30_000
// One capture per process per window. Starting the profiler makes V8 log every
// compiled function, and at 1ms sampling a 30s capture is a profile of a few
// MB copied to the main thread, so neither is free.
const CAPTURE_COOLDOWN_MS = 10 * 60_000

export type StallCapture = {
  // How long the heartbeat had been stuck when the capture began.
  blockedBeforeCaptureMs: number
  // Bounds on the stall, from its start: the last time the heartbeat was seen
  // stuck, and the first time it was seen moving again (null if it was still
  // stuck when the capture gave up). Neither includes profiler cleanup. They
  // are far apart when the main thread only serviced Profiler.start late.
  stalledAtLeastMs: number
  stalledAtMostMs: number | null
  // Heuristic: the heartbeat was still stuck when Profiler.start returned.
  // False means the main thread only serviced it after the stall ended, i.e.
  // it was off-CPU (blocking syscall, descheduled) and the profile shows what
  // ran afterwards, not the stall.
  profilerStartedDuringStall: boolean
  profiledMs: number
  // CPU time of this whole process (every thread, including this worker and
  // V8's GC helpers) over the capture. Near the wall time suggests the main
  // thread was computing; near zero, that it was waiting.
  cpuUserMs: number
  cpuSystemMs: number
  wallMs: number
  profile: CpuProfile
}
type WorkerMessage = { capture: StallCapture } | { error: string }

// Plain CommonJS run with `eval: true`, so it needs no build output of its own.
const WORKER_SOURCE = `
const { parentPort, workerData } = require('worker_threads')
const inspector = require('inspector')
const { heartbeat, stallMs, pollMs, maxProfileMs, cooldownMs } = workerData
const beat = new Int32Array(heartbeat)
const session = new inspector.Session()
session.connectToMainThread()
const post = (method, params) =>
  new Promise((resolve, reject) =>
    session.post(method, params || {}, (err, res) => (err ? reject(err) : resolve(res)))
  )
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

let lastBeat = Atomics.load(beat, 0)
let lastChange = Date.now()
let lastCapture = -Infinity
let busy = false

async function capture(stuckBeat, stallStart, seenStuckAt) {
  const cpu0 = process.cpuUsage()
  const t0 = Date.now()
  let started = false
  let profile = null
  let lastSeenStuck = seenStuckAt
  let recoveredAt = null
  let profilerStartedDuringStall = false
  try {
    await post('Profiler.enable')
    await post('Profiler.setSamplingInterval', { interval: 1000 })
    await post('Profiler.start')
    started = true
    profilerStartedDuringStall = Atomics.load(beat, 0) === stuckBeat
    // Check the heartbeat before the deadline, so a stall that ended while
    // Profiler.start was pending still counts as recovered.
    while (true) {
      const now = Date.now()
      if (Atomics.load(beat, 0) !== stuckBeat) {
        recoveredAt = now
        break
      }
      lastSeenStuck = now
      if (now - t0 >= maxProfileMs) break
      await sleep(50)
    }
    profile = (await post('Profiler.stop')).profile
    started = false
  } finally {
    // Always leave the profiler stopped and disabled, even after an error.
    // Captures stay serialized (busy) until this settles.
    if (started) await post('Profiler.stop').catch(() => {})
    await post('Profiler.disable').catch(() => {})
  }
  const cpu = process.cpuUsage(cpu0)
  return {
    blockedBeforeCaptureMs: t0 - stallStart,
    stalledAtLeastMs: lastSeenStuck - stallStart,
    stalledAtMostMs: recoveredAt === null ? null : recoveredAt - stallStart,
    profilerStartedDuringStall,
    profiledMs: Math.round((profile.endTime - profile.startTime) / 1000),
    cpuUserMs: Math.round(cpu.user / 1000),
    cpuSystemMs: Math.round(cpu.system / 1000),
    wallMs: Date.now() - t0,
    profile,
  }
}

setInterval(() => {
  const now = Date.now()
  const current = Atomics.load(beat, 0)
  if (current !== lastBeat) {
    lastBeat = current
    lastChange = now
    return
  }
  if (busy || now - lastChange < stallMs || now - lastCapture < cooldownMs) return
  busy = true
  lastCapture = now
  capture(current, lastChange, now)
    .then((result) => parentPort.postMessage({ capture: result }))
    .catch((err) => parentPort.postMessage({ error: String((err && err.message) || err) }))
    .finally(() => {
      busy = false
    })
}, pollMs)
`

let started = false

export function startStallWatchdog() {
  if (started) return
  started = true

  const heartbeat = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  const beat = new Int32Array(heartbeat)
  const heartbeatInterval = setInterval(
    () => Atomics.add(beat, 0, 1),
    HEARTBEAT_MS
  )
  heartbeatInterval.unref()

  // Diagnostics must never take the server down: on any failure, log and run
  // without the watchdog.
  let worker: Worker
  try {
    // No resourceLimits: PM2's --max-old-space-size would override them.
    worker = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: {
        heartbeat,
        stallMs: STALL_CAPTURE_MS,
        pollMs: POLL_MS,
        maxProfileMs: MAX_PROFILE_MS,
        cooldownMs: CAPTURE_COOLDOWN_MS,
      },
    })
  } catch (error) {
    clearInterval(heartbeatInterval)
    log.error('Stall watchdog failed to start.', { error })
    return
  }
  worker.on('message', (msg: WorkerMessage) => {
    if ('error' in msg) {
      log.error('Stall watchdog capture failed.', { error: msg.error })
      return
    }
    const { profile, ...stats } = msg.capture
    const summary = summarizeCpuProfile(profile, {
      maxStacks: 5,
      maxFrames: 25,
      maxSelf: 15,
    })
    const secs = (ms: number) => (ms / 1000).toFixed(1)
    const { stalledAtLeastMs: least, stalledAtMostMs: most } = stats
    const stalled =
      most === null
        ? `at least ${secs(least)}s`
        : most - least <= 500
        ? `${secs(most)}s`
        : `${secs(least)}-${secs(most)}s`
    log.warn(
      `Event loop stall profile: blocked ${stalled}, top: ${
        summary.topSelf[0]?.frame ?? 'no samples'
      }.`,
      { ...stats, ...summary }
    )
  })
  worker.on('error', (error) => {
    clearInterval(heartbeatInterval)
    log.error('Stall watchdog worker crashed.', { error })
  })
  // After the listeners: attaching a 'message' listener re-refs the worker's
  // port, and the watchdog must never keep the process alive.
  worker.unref()
}
