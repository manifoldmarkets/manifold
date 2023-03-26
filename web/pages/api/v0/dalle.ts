import { NextApiRequest, NextApiResponse } from 'next'
import {
  CORS_ORIGIN_MANIFOLD,
  CORS_ORIGIN_LOCALHOST,
} from 'common/envs/constants'
import { applyCorsHeaders } from 'web/lib/api/cors'
import { Configuration, OpenAIApi } from 'openai'
import { upload } from 'web/pages/api/v0/dream'

export const config = { api: { bodyParser: true } }

// Highly experimental. Proxy for https://github.com/vpzomtrrfrt/stability-client
export default async function route(req: NextApiRequest, res: NextApiResponse) {
  await applyCorsHeaders(req, res, {
    origin: [CORS_ORIGIN_MANIFOLD, CORS_ORIGIN_LOCALHOST],
    methods: 'POST',
  })

  // Check that prompt and apiKey are included in the body
  if (!req.body.prompt) {
    res.status(400).json({ message: 'Missing prompt' })
    return
  }
  if (!req.body.apiKey) {
    res.status(400).json({ message: 'Missing apiKey' })
    return
  }

  try {
    const configuration = new Configuration({
      apiKey: req.body.apiKey,
    })

    const openai = new OpenAIApi(configuration)
    const response = await openai.createImage({
      prompt: req.body.prompt,
      n: 1,
      size: '512x512',
      response_format: 'b64_json',
    })

    const b64 = response.data.data[0].b64_json
    if (!b64) {
      res.status(400).json({ message: 'Image generation failed' })
      return
    }
    const buffer = Buffer.from(b64, 'base64')

    const url = await upload(buffer)
    // const image_url = response.data.data[0].url

    res.status(200).json({ url })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: `Error running code: ${e}` })
  }
}
