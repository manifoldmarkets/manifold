export const batchedWaitAll = async <T>(
  createPromises: (() => Promise<T>)[],
  batchSize = 10
) => {
  const numBatches = Math.ceil(createPromises.length / batchSize)
  const result: T[] = []
  for (let batchIndex = 0; batchIndex < numBatches; batchIndex++) {
    const from = batchIndex * batchSize
    const to = from + batchSize

    const promises = createPromises.slice(from, to).map((f) => f())

    const batch = await Promise.all(promises)
    result.push(...batch)
  }

  return result
}
