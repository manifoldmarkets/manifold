export const safeJsonParse = (json: string | undefined | null) => {
  try {
    return JSON.parse(json ?? '')
  } catch {
    return null
  }
}
