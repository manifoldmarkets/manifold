import {
  getDeterministicABTestVariant,
  getForcedABTestVariant,
} from './ab-test'

export const DISCOVERY_EXPERIMENT_NAME = 'discovery-v1'
export const DISCOVERY_EXPERIMENT_VARIANTS = ['control', 'treatment'] as const
export type DiscoveryExperimentVariant =
  (typeof DISCOVERY_EXPERIMENT_VARIANTS)[number]
export type DiscoveryExperimentAssignmentSource =
  | 'forced'
  | 'user-hash'
  | 'device-hash'
export type DiscoveryExperimentSurface = 'for-you' | 'text-search' | 'browse'

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

export const getDiscoveryExperimentAssignment = (args: {
  userId?: string
  deviceId?: string
}): DiscoveryExperimentAssignment | undefined => {
  const { userId, deviceId } = args
  const assignmentId = userId ?? deviceId
  if (!assignmentId) return undefined

  const forcedVariant = getForcedABTestVariant(
    userId,
    DISCOVERY_EXPERIMENT_VARIANTS
  )
  return {
    variant: getDeterministicABTestVariant(
      DISCOVERY_EXPERIMENT_NAME,
      `${userId ? 'user' : 'device'}:${assignmentId}`,
      DISCOVERY_EXPERIMENT_VARIANTS,
      forcedVariant
    ),
    source: forcedVariant ? 'forced' : userId ? 'user-hash' : 'device-hash',
  }
}

// Omitted means control so older clients do not enter the experiment merely
// because the API deployed first. When a current signed-in client opts in,
// independently reproduce its immutable-user assignment on the server rather
// than trusting the arm in the request.
export const getEffectiveDiscoveryExperimentVariant = (args: {
  userId?: string
  requestedVariant?: DiscoveryExperimentVariant
}): DiscoveryExperimentVariant => {
  const { userId, requestedVariant } = args
  if (requestedVariant === undefined) return 'control'
  if (!userId) return requestedVariant
  return getDiscoveryExperimentAssignment({ userId })!.variant
}

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
