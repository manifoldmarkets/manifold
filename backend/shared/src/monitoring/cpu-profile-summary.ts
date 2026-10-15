import { sortBy, take } from 'lodash'

// The subset of a V8 CPU profile (inspector Profiler.stop) that we read.
export type CpuProfileCallFrame = {
  functionName: string
  url: string
  lineNumber: number
  columnNumber: number
}
export type CpuProfileNode = {
  id: number
  callFrame: CpuProfileCallFrame
  children?: number[]
}
export type CpuProfile = {
  nodes: CpuProfileNode[]
  startTime: number
  endTime: number
  samples?: number[]
}

export type CpuProfileSummary = {
  sampleCount: number
  // Where the samples landed (leaf frame), most first. V8's pseudo-frames say
  // what the thread was doing outside JS: '(garbage collector)', '(program)'
  // (native code, including blocking syscalls) and '(idle)'.
  topSelf: { frame: string; samples: number; pct: number }[]
  // The hottest distinct call stacks, leaf first.
  topStacks: { samples: number; pct: number; frames: string[] }[]
}

const APP_ROOT = /^file:\/\/\/usr\/src\/app\//

export function formatCallFrame(frame: CpuProfileCallFrame) {
  const name = frame.functionName || '(anonymous)'
  if (!frame.url) return name
  const url = frame.url.replace(APP_ROOT, '')
  return `${name} ${url}:${frame.lineNumber + 1}:${frame.columnNumber + 1}`
}

export function summarizeCpuProfile(
  profile: CpuProfile,
  opts: { maxStacks: number; maxFrames: number; maxSelf: number }
): CpuProfileSummary {
  const samples = profile.samples ?? []
  const sampleCount = samples.length
  const pct = (n: number) =>
    sampleCount > 0 ? Math.round((n / sampleCount) * 1000) / 10 : 0

  const nodesById = new Map(profile.nodes.map((n) => [n.id, n]))
  const parentById = new Map<number, number>()
  for (const node of profile.nodes) {
    for (const child of node.children ?? []) parentById.set(child, node.id)
  }

  const samplesByNode = new Map<number, number>()
  for (const id of samples) {
    samplesByNode.set(id, (samplesByNode.get(id) ?? 0) + 1)
  }

  const samplesByFrame = new Map<string, number>()
  for (const [id, count] of samplesByNode) {
    const node = nodesById.get(id)
    if (!node) continue
    const frame = formatCallFrame(node.callFrame)
    samplesByFrame.set(frame, (samplesByFrame.get(frame) ?? 0) + count)
  }
  const topSelf = take(
    sortBy([...samplesByFrame], ([, count]) => -count),
    opts.maxSelf
  ).map(([frame, count]) => ({ frame, samples: count, pct: pct(count) }))

  const stackFrames = (leafId: number) => {
    const frames: string[] = []
    let id: number | undefined = leafId
    while (id !== undefined && frames.length < opts.maxFrames) {
      const node = nodesById.get(id)
      if (!node || node.callFrame.functionName === '(root)') break
      frames.push(formatCallFrame(node.callFrame))
      id = parentById.get(id)
    }
    return frames
  }
  const topStacks = take(
    sortBy([...samplesByNode], ([, count]) => -count),
    opts.maxStacks
  ).map(([id, count]) => ({
    samples: count,
    pct: pct(count),
    frames: stackFrames(id),
  }))

  return { sampleCount, topSelf, topStacks }
}
