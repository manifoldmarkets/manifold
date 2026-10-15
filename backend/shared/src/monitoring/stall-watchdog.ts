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
// moves again. Inspector commands are delivered to a busy main thread by a V8
// interrupt, so the profiler starts mid-stall, not after it. The profile comes
// back to the main thread, which logs the hottest stacks once it is free.
//
// We use the profiler, never Debugger.pause: nothing here can leave the main
// thread paused.

const HEARTBEAT_MS = 100
const POLL_MS = 250
const STALL_CAPTURE_MS = 2_000
// Bounds a capture if the main thread never comes back.
const MAX_PROFILE_MS = 30_000
// One capture per process per window. Starting the profiler makes V8 log every
// compiled function, so it is not free.
const CAPTURE_COOLDOWN_MS = 10 * 60_000

export type StallCapture = {
  // How long the heartbeat had been stuck when the capture began.
  blockedBeforeCaptureMs: number
  // False if the main thread only serviced Profiler.start after the stall
  // ended: then it was off-CPU (blocked in a syscall, or descheduled) and the
  // profile shows what ran afterwards, not the stall.
  profilerStartedDuringStall: boolean
  profiledMs: number
  // Process-wide CPU time (all threads) over the capture. Close to the wall
  // time means the main thread was computing; near zero means it was waiting.
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

async function capture(stuckBeat, blockedBeforeCaptureMs) {
  const cpu0 = process.cpuUsage()
  const t0 = Date.now()
  await post('Profiler.enable')
  await post('Profiler.setSamplingInterval', { interval: 1000 })
  await post('Profiler.start')
  const startedAt = Date.now()
  const profilerStartedDuringStall = Atomics.load(beat, 0) === stuckBeat
  while (Atomics.load(beat, 0) === stuckBeat && Date.now() - t0 < maxProfileMs) {
    await sleep(50)
  }
  const { profile } = await post('Profiler.stop')
  await post('Profiler.disable')
  const cpu = process.cpuUsage(cpu0)
  return {
    blockedBeforeCaptureMs,
    profilerStartedDuringStall,
    profiledMs: Date.now() - startedAt,
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
  capture(current, now - lastChange)
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
  setInterval(() => Atomics.add(beat, 0, 1), HEARTBEAT_MS).unref()

  const worker = new Worker(WORKER_SOURCE, {
    eval: true,
    workerData: {
      heartbeat,
      stallMs: STALL_CAPTURE_MS,
      pollMs: POLL_MS,
      maxProfileMs: MAX_PROFILE_MS,
      cooldownMs: CAPTURE_COOLDOWN_MS,
    },
    resourceLimits: { maxOldGenerationSizeMb: 256 },
  })
  worker.unref()
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
    log.warn(
      `Event loop stall profile: blocked ${(
        (stats.blockedBeforeCaptureMs + stats.profiledMs) /
        1000
      ).toFixed(1)}s, top: ${summary.topSelf[0]?.frame ?? 'no samples'}.`,
      { ...stats, ...summary }
    )
  })
  // Diagnostics must never take the server down: log and carry on without it.
  worker.on('error', (error) => {
    log.error('Stall watchdog worker crashed.', { error })
  })
}
