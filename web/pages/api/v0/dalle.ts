import OpenAI from 'openai'
import { NextApiRequest, NextApiResponse } from 'next'

import { applyCorsHeaders } from 'web/lib/api/cors'
import { upload } from 'web/pages/api/v0/dream'

export const config = { api: { bodyParser: true } }

// Highly experimental. Proxy for https://github.com/vpzomtrrfrt/stability-client
export default async function route(req: NextApiRequest, res: NextApiResponse) {
  await applyCorsHeaders(req, res)

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
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const b64 = await openai.images
      .generate({
        model: 'dall-e-3',
        prompt: req.body.prompt,
        n: 1,
        size: '1792x1024',
        quality: 'standard',
      })
      .then((res) => res.data[0].b64_json)
      .catch((err) => (console.log(err), undefined))

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
