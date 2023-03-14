export const tryOrLogError = async <T>(task: Promise<T>) => {
  try {
    return await task
  } catch (e) {
    console.error(e)
    return null
  }
}
