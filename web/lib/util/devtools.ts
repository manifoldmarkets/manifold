// devtoolsDetector.ts
export interface DevtoolsDetectorConfig {
  pollingIntervalSeconds: number
  maxMillisBeforeAckWhenClosed: number
  moreAnnoyingDebuggerStatements: number
  onDetectOpen?: () => void
  onDetectClose?: () => void
  startup: 'asap' | 'manual' | 'domContentLoaded'
  onCheckOpennessWhilePaused: 'returnStaleValue' | 'throw'
}

export interface DevtoolsDetector {
  config: DevtoolsDetectorConfig
  readonly isOpen: boolean
  paused: boolean
}

export const setupDevtoolsDetector = (): DevtoolsDetector => {
  const config: DevtoolsDetectorConfig = {
    pollingIntervalSeconds: 0.25,
    maxMillisBeforeAckWhenClosed: 100,
    moreAnnoyingDebuggerStatements: 1,
    onDetectOpen: undefined,
    onDetectClose: undefined,
    startup: 'asap',
    onCheckOpennessWhilePaused: 'returnStaleValue',
  }

  Object.seal(config)

  // Create worker from separate file
  const heart = new Worker(new URL('./devtools.worker.ts', import.meta.url))

  let _isDevtoolsOpen = false
  let _isDetectorPaused = true
  let resolveVerdict: (value: boolean | null) => void = () => {}
  let nextPulse$: NodeJS.Timeout | number = NaN

  const onHeartMsg = (msg: MessageEvent<{ isOpenBeat: boolean }>) => {
    if (msg.data.isOpenBeat) {
      const p = new Promise<boolean | null>((_resolveVerdict) => {
        resolveVerdict = _resolveVerdict
        let wait$: NodeJS.Timeout | number = setTimeout(() => {
          wait$ = NaN
          resolveVerdict(true)
        }, config.maxMillisBeforeAckWhenClosed + 1)
      })

      p.then((verdict) => {
        if (verdict === null) return
        if (verdict !== _isDevtoolsOpen) {
          _isDevtoolsOpen = verdict
          const cb = { true: config.onDetectOpen, false: config.onDetectClose }[
            verdict + ''
          ]
          if (cb) cb()
        }
        nextPulse$ = setTimeout(() => {
          nextPulse$ = NaN
          doOnePulse()
        }, config.pollingIntervalSeconds * 1000)
      })
    } else {
      resolveVerdict(false)
    }
  }

  const doOnePulse = () => {
    heart.postMessage({ moreDebugs: config.moreAnnoyingDebuggerStatements })
  }

  const detector: DevtoolsDetector = {
    config,
    get isOpen() {
      if (_isDetectorPaused && config.onCheckOpennessWhilePaused === 'throw') {
        throw new Error('`onCheckOpennessWhilePaused` is set to `"throw"`.')
      }
      return _isDevtoolsOpen
    },
    get paused() {
      return _isDetectorPaused
    },
    set paused(pause: boolean) {
      if (_isDetectorPaused === pause) return
      _isDetectorPaused = pause
      if (pause) {
        heart.removeEventListener('message', onHeartMsg as EventListener)
        clearTimeout(nextPulse$)
        nextPulse$ = NaN
        resolveVerdict(null)
      } else {
        heart.addEventListener('message', onHeartMsg as EventListener)
        doOnePulse()
      }
    },
  }

  Object.freeze(detector)
  return detector
}
