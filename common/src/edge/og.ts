// see https://vercel.com/docs/concepts/functions/edge-functions/edge-functions-api for restrictions

export type Point = { x: number; y: number }

function base64toPointsInternal(
  base64urlString: string,
  type: 'float64' | 'float32'
) {
  const b64 = base64urlString.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const u = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  const f =
    type === 'float64' ? new Float64Array(u.buffer) : new Float32Array(u.buffer)

  const points = [] as { x: number; y: number }[]
  for (let i = 0; i < f.length; i += 2) {
    points.push({ x: f[i], y: f[i + 1] })
  }
  return points
}

export function base64toFloat32Points(base64urlString: string) {
  return base64toPointsInternal(base64urlString, 'float32')
}

export function base64toPoints(base64urlString: string) {
  return base64toPointsInternal(base64urlString, 'float64')
}
