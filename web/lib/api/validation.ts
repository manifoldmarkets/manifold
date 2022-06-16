import { NextApiRequest, NextApiResponse } from 'next'

// Asserts that the request is using the specified HTTP method.
// Writes appropriate error response if an unexpected method is set.
export function assertHTTPMethod(
  req: NextApiRequest,
  res: NextApiResponse,
  method: string
): boolean {
  if (req.method !== method) {
    res.setHeader('Allow', [method])
    res.status(405).end(`Method ${req.method} Not Allowed`)
    return false
  }
  return true
}
