export const computeColorStops = <P>(
  data: P[],
  pc: (p: P) => string,
  px: (p: P) => number
) => {
  const segments: { x: number; color: string }[] = []
  let currOffset = 0
  let currColor = pc(data[0])
  for (const p of data) {
    const c = pc(p)
    if (c !== currColor) {
      segments.push({ x: currOffset, color: currColor })
      currOffset = px(p)
      currColor = c
    }
  }
  segments.push({ x: currOffset, color: currColor })

  const stops: { x: number; color: string }[] = []
  stops.push({ x: segments[0].x, color: segments[0].color })
  for (const s of segments.slice(1)) {
    stops.push({ x: s.x, color: stops[stops.length - 1].color })
    stops.push({ x: s.x, color: s.color })
  }
  return stops
}
