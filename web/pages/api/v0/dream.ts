import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage'
import { nanoid } from 'nanoid'
import { NextApiRequest, NextApiResponse } from 'next'
import { generateAsync } from 'stability-client'
import { storage } from 'web/lib/firebase/init'
import {
  CORS_ORIGIN_MANIFOLD,
  CORS_ORIGIN_LOCALHOST,
} from 'common/envs/constants'
import { applyCorsHeaders } from 'web/lib/api/cors'

export const config = { api: { bodyParser: true } }

// Highly experimental. Proxy for https://github.com/vpzomtrrfrt/stability-client
export default async function route(req: NextApiRequest, res: NextApiResponse) {
  await applyCorsHeaders(req, res, {
    origin: [CORS_ORIGIN_MANIFOLD, CORS_ORIGIN_LOCALHOST],
    methods: 'POST',
  })

  const body = JSON.parse(req.body)
  // Check that prompt and apiKey are included in the body
  if (!body.prompt) {
    res.status(400).json({ message: 'Missing prompt' })
    return
  }
  if (!body.apiKey) {
    res.status(400).json({ message: 'Missing apiKey' })
    return
  }
  /** Optional params:
  outDir: string
  debug: boolean
  requestId: string
  samples: number
  engine: string
  host: string
  seed: number
  width: number
  height: number
  diffusion: keyof typeof diffusionMap
  steps: number
  cfgScale: number
  noStore: boolean
  imagePrompt: {mime: string; content: Buffer} | null
  stepSchedule: {start?: number; end?: number}
  */

  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const { _dreamResponse, images } = await generateAsync({
      ...body,
      // Don't actually write to disk, because we're going to upload it to Firestore
      noStore: true,
    })
    const buffer: Buffer = images[0].buffer
    const url = await upload(buffer)

    res.status(200).json({ url })
  } catch (e) {
    res.status(501).json({ message: `Error running code: ${e}` })
  }
}

// Loosely copied from web/lib/firebase/storage.ts
const ONE_YEAR_SECS = 60 * 60 * 24 * 365

async function upload(buffer: Buffer) {
  const filename = `${nanoid(10)}.png`
  const storageRef = ref(storage, `dream/${filename}`)
  const uploadTask = uploadBytesResumable(storageRef, buffer, {
    cacheControl: `public, max-age=${ONE_YEAR_SECS}`,
    contentType: 'image/png',
  })

  let resolvePromise: (url: string) => void
  let rejectPromise: (reason?: any) => void

  const promise = new Promise<string>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })

  const unsubscribe = uploadTask.on(
    'state_changed',
    (_snapshot) => {},
    (error) => {
      // A full list of error codes is available at
      // https://firebase.google.com/docs/storage/web/handle-errors
      rejectPromise(error)
      unsubscribe()
    },
    () => {
      getDownloadURL(uploadTask.snapshot.ref).then((downloadURL) => {
        resolvePromise(downloadURL)
      })

      unsubscribe()
    }
  )

  return await promise
}
