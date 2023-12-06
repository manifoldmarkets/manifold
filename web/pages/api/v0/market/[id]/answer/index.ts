import { NextApiRequest, NextApiResponse } from 'next'

import { applyCorsHeaders } from 'web/lib/api/cors'
import { fetchBackend, forwardResponse } from 'web/lib/api/proxy'
import { getContract } from 'web/lib/supabase/contracts'

export const config = { api: { bodyParser: true } }

export default async function route(req: NextApiRequest, res: NextApiResponse) {
  await applyCorsHeaders(req, res)

  const { id } = req.query
  const contractId = id as string

  const contract = await getContract(contractId)
  if (!contract) {
    res.status(404).json({ error: 'Contract not found' })
    return
  }

  if (req.body) req.body.contractId = contractId
  try {
    if (contract.outcomeType === 'MULTIPLE_CHOICE') {
      const backendRes = await fetchBackend(req, 'createanswercpmm')
      await forwardResponse(res, backendRes)
    } else {
      res.status(400).json({
        error: 'Only mutliple choice markets are supported at this time.',
      })
    }
  } catch (err) {
    console.error('Error talking to cloud function: ', err)
    res.status(500).json({ message: 'Error communicating with backend.' })
  }
}
