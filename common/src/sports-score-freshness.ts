/** A provider observation time, never the time our server polled the feed. */
export function scoreUpdatedTime(
  value: string | null,
  receivedAt: number
): number | null {
  const timestamp = value ? Date.parse(value) : NaN
  return Number.isFinite(timestamp) &&
    timestamp > 0 &&
    timestamp <= receivedAt + 60_000
    ? timestamp
    : null
}

export function scoreAgeLabel(
  updatedTime: number | null | undefined,
  now: number
): string {
  if (
    updatedTime == null ||
    !Number.isFinite(updatedTime) ||
    updatedTime <= 0 ||
    !Number.isFinite(now) ||
    updatedTime > now + 60_000
  )
    return 'Score update time unavailable'
  const minutes = Math.floor(Math.max(0, now - updatedTime) / 60_000)
  if (minutes < 1) return 'Score as of <1m ago'
  if (minutes < 60) return `Score as of ${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Score as of ${hours}h ${minutes % 60}m ago`
  return `Score as of ${Math.floor(hours / 24)}d ago`
}
