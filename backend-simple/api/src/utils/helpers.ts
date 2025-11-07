// Generate random alphanumeric ID
export function randomId(length = 12): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// Generate slug from question
export function generateSlug(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with dash
    .replace(/^-+|-+$/g, '') // Trim dashes
    .substring(0, 100) // Max 100 chars
    .concat(`-${randomId(8)}`) // Add random suffix for uniqueness
}

// Format number as currency
export function formatMoney(amount: number): string {
  return `M$${Math.round(amount).toLocaleString()}`
}

// Format probability as percentage
export function formatPercent(prob: number): string {
  return `${Math.round(prob * 100)}%`
}

// Check if user looks like spam/bot
export function humanish(user: any): boolean {
  // Basic heuristics
  if (!user.name || !user.username) return false
  if (user.name.length < 2) return false
  if (user.username.length < 3) return false

  // Check for suspiciously random names
  const randomPattern = /^[a-z0-9]{20,}$/i
  if (randomPattern.test(user.username)) return false

  return true
}

// Get display probability (for binary markets)
export function getDisplayProbability(
  prob: number,
  outcomeType: string
): number {
  if (outcomeType !== 'BINARY') return prob

  // Round to nearest 1%
  return Math.round(prob * 100) / 100
}

// Contract path helper
export function contractPath(slug: string): string {
  return `/${slug}`
}

// Validate closeTime
export function validateCloseTime(closeTime?: number): number | undefined {
  if (!closeTime) return undefined

  const now = Date.now()
  const maxCloseTime = now + 365 * 24 * 60 * 60 * 1000 // Max 1 year

  if (closeTime < now) {
    throw new Error('Close time must be in the future')
  }

  if (closeTime > maxCloseTime) {
    throw new Error('Close time cannot be more than 1 year in the future')
  }

  return closeTime
}

// Parse JSONB data from database
export function parseJsonData<T>(row: any, defaults: Partial<T> = {}): T {
  if (!row) return defaults as T

  try {
    const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data

    return {
      ...defaults,
      ...data,
      // Override with column values if present
      ...(row.id && { id: row.id }),
      ...(row.created_time && { createdTime: new Date(row.created_time).getTime() }),
    }
  } catch (e) {
    console.error('Error parsing JSON data:', e)
    return { ...defaults, ...(row || {}) } as T
  }
}

// Safe parseInt
export function safeParseInt(value: any, defaultValue: number): number {
  const parsed = parseInt(value, 10)
  return isNaN(parsed) ? defaultValue : parsed
}

// Safe parseFloat
export function safeParseFloat(value: any, defaultValue: number): number {
  const parsed = parseFloat(value)
  return isNaN(parsed) ? defaultValue : parsed
}

// Clamp value between min and max
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// Calculate unique bettor count increment
export function shouldIncrementUniqueBettors(
  userId: string,
  existingBets: any[]
): boolean {
  // Check if user has already bet on this contract
  return !existingBets.some((bet) => bet.user_id === userId)
}

// Get current timestamp
export function now(): number {
  return Date.now()
}

// Sleep helper
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
