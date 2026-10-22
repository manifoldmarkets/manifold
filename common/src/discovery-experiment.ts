export const DISCOVERY_EXPERIMENT_NAME = 'discovery-v1'
export const DISCOVERY_EXPERIMENT_VARIANTS = ['control', 'treatment'] as const
export type DiscoveryExperimentVariant =
  (typeof DISCOVERY_EXPERIMENT_VARIANTS)[number]
export type DiscoveryExperimentAssignmentSource =
  | 'forced'
  | 'user-hash'
  | 'device-hash'
export type DiscoveryExperimentSurface = 'for-you' | 'text-search' | 'browse'

// The discovery-v1 experiment concluded on 2026-09-26. Over the clean
// 2026-09-15 to 2026-09-29 window, treatment lowered the For You
// meaningful-action rate (−2.2 pp, 95% CI −4.3 to −0.1) and did not move
// text-search CTR (−0.3 pp, CI −2.9 to +2.3), so every user now receives the
// control experience. The assignment plumbing and the discovery_v1 events are
// kept so Browse keeps producing the same baseline telemetry for the next
// test; the treatment code paths are dormant until then.
export const DISCOVERY_EXPERIMENT_CONCLUDED_VARIANT: DiscoveryExperimentVariant &
  'control' = 'control'
export const DISCOVERY_EXPERIMENT_ACTIVE_VARIANTS = [
  DISCOVERY_EXPERIMENT_CONCLUDED_VARIANT,
] as const

export type DiscoveryResultTracking = DiscoveryExperimentAssignment & {
  assignmentKey: string
  resultSetId: string
  presentationId: string
  sourceComponent: string
  surface: DiscoveryExperimentSurface
  semanticEligible: boolean
  semanticMarketCount: number
  initialLatencyMs: number
  compatibilityFallback: boolean
  anchorFallback: boolean
}

export const DISCOVERY_SEARCH_REQUEST_EVENT = 'discovery_v1 search request'
export const DISCOVERY_RESULTS_EVENT = 'discovery_v1 results'
export const DISCOVERY_EXPOSURE_EVENT = 'discovery_v1 exposure'
export const DISCOVERY_RESULT_CLICK_EVENT = 'discovery_v1 result click'
export const DISCOVERY_SEARCH_ERROR_EVENT = 'discovery_v1 search error'
export const DISCOVERY_SEARCH_ABORT_EVENT = 'discovery_v1 search abort'

export type DiscoveryExperimentAssignment = {
  variant: DiscoveryExperimentVariant
  source: DiscoveryExperimentAssignmentSource
}

// Everyone is in control now that the experiment has concluded. The
// assignment unit is still reported so the exposure telemetry keeps the same
// shape it had during the test.
export const getDiscoveryExperimentAssignment = (args: {
  userId?: string
  deviceId?: string
}): DiscoveryExperimentAssignment | undefined => {
  const { userId, deviceId } = args
  if (!userId && !deviceId) return undefined

  return {
    variant: DISCOVERY_EXPERIMENT_CONCLUDED_VARIANT,
    source: userId ? 'user-hash' : 'device-hash',
  }
}

// The server never trusts the arm in the request. With the experiment
// concluded there is nothing to reproduce either: every caller, signed in or
// anonymous, current client or old, gets control.
export const getEffectiveDiscoveryExperimentVariant = (_args: {
  userId?: string
  requestedVariant?: DiscoveryExperimentVariant
}): DiscoveryExperimentVariant => DISCOVERY_EXPERIMENT_CONCLUDED_VARIANT

export type DiscoveryQueryLengthBucket =
  | '0'
  | '1-2'
  | '3-5'
  | '6-15'
  | '16-50'
  | '51-200'
  | '201+'

export const getDiscoveryQueryLengthBucket = (
  query: string
): DiscoveryQueryLengthBucket => {
  const length = query.trim().length
  if (length === 0) return '0'
  if (length <= 2) return '1-2'
  if (length <= 5) return '3-5'
  if (length <= 15) return '6-15'
  if (length <= 50) return '16-50'
  if (length <= 200) return '51-200'
  return '201+'
}
