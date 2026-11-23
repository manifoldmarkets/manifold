import { API } from '../api/schema'
import type {
  AdminMajorCreationResult,
  MajorCreationConfirmation,
  MajorLeague,
} from './major-leagues'
export type CreationRow = AdminMajorCreationResult['log'][number]
export type CreationScope = {
  league: MajorLeague
  competitionId: string
  force: boolean
  keys: string[]
}
const requestSchema = API['admin-sports-create-bdl-markets'].props
export function creationPreviewRequest(scope: CreationScope) {
  const keys = scope.keys.length ? scope.keys : undefined
  const preview = requestSchema.safeParse({ ...scope, dryRun: true, keys })
  return preview.success ? preview.data : undefined
}
export function confirmedCreationSelection(
  rows: CreationRow[],
  scope: CreationScope,
  keys: string[]
) {
  const maxAntes: Record<string, number> = {}
  const confirmations: Record<string, MajorCreationConfirmation> = {}
  if (scope.force && !scope.keys.length) return
  for (const id of keys) {
    const matching = rows.filter((r) => r.eventId === id)
    const row = matching[0]
    if (
      matching.length !== 1 ||
      row.league !== scope.league ||
      row.status !== 'dry-run' ||
      (scope.keys.length && !scope.keys.includes(id)) ||
      !row.confirmation ||
      !Number.isFinite(new Date(row.confirmation.startTime).getTime()) ||
      row.ante == null ||
      row.ante <= 0 ||
      row.answerLabels?.length !== 2 ||
      row.answerLabels.some((s) => !s?.trim()) ||
      row.answerLabels[0].trim().toLowerCase() ===
        row.answerLabels[1].trim().toLowerCase()
    )
      return
    maxAntes[id] = row.ante
    confirmations[id] = row.confirmation
  }
  const request = { ...scope, keys, dryRun: false, maxAntes, confirmations }
  if (requestSchema.safeParse(request).success) return request
}
