import { isSportsOgLogoUrl, SportsOgMarket } from 'common/sports-og'

const MAX_LOGO_BYTES = 512 * 1024

/** Fetch once, then give Satori embedded images so a failed logo keeps its badge. */
export async function loadSportsOgLogos(
  market: SportsOgMarket | null,
  fetcher: typeof fetch = fetch
): Promise<(string | undefined)[]> {
  return Promise.all(
    (market?.outcomes.slice(0, 2) ?? []).map(async ({ imageUrl }) => {
      if (!imageUrl || !isSportsOgLogoUrl(imageUrl)) return undefined
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 1500)
      try {
        const response = await fetcher(imageUrl, {
          signal: controller.signal,
          redirect: 'error',
        })
        // WebP/SVG are not reliably supported by the existing OG renderer.
        const mime = response.headers.get('content-type')?.split(';')[0]
        if (
          !response.ok ||
          (mime !== 'image/png' && mime !== 'image/jpeg') ||
          Number(response.headers.get('content-length')) > MAX_LOGO_BYTES
        ) {
          await response.body?.cancel()
          return undefined
        }
        const reader = response.body?.getReader()
        if (!reader) return undefined
        const chunks: Uint8Array[] = []
        let length = 0
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          length += value.length
          if (length > MAX_LOGO_BYTES) {
            await reader.cancel()
            return undefined
          }
          chunks.push(value)
        }
        const bytes = Buffer.concat(chunks)
        const png = bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        if ((mime === 'image/png' && !png) || (mime === 'image/jpeg' && !jpeg))
          return undefined
        return `data:${mime};base64,${bytes.toString('base64')}`
      } catch {
        return undefined
      } finally {
        clearTimeout(timeout)
      }
    })
  )
}
