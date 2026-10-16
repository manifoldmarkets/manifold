import {
  CpuProfile,
  formatCallFrame,
  summarizeCpuProfile,
} from './cpu-profile-summary'

const frame = (functionName: string, url = '', lineNumber = 0) => ({
  functionName,
  url,
  lineNumber,
  columnNumber: 0,
})

// (root) -> handler -> { hotLoop, (garbage collector) }; (root) -> (program)
const profile: CpuProfile = {
  startTime: 0,
  endTime: 10_000,
  nodes: [
    { id: 1, callFrame: frame('(root)'), children: [2, 5] },
    {
      id: 2,
      callFrame: frame(
        'handler',
        'file:///usr/src/app/backend/api/lib/place-bet.js',
        9
      ),
      children: [3, 4],
    },
    {
      id: 3,
      callFrame: frame('hotLoop', 'file:///usr/src/app/common/lib/calc.js', 41),
    },
    { id: 4, callFrame: frame('(garbage collector)') },
    { id: 5, callFrame: frame('(program)') },
  ],
  samples: [3, 3, 3, 3, 3, 3, 4, 4, 5, 2],
}

describe('summarizeCpuProfile', () => {
  it('ranks leaf frames by samples, with percentages', () => {
    const summary = summarizeCpuProfile(profile, {
      maxStacks: 5,
      maxFrames: 10,
      maxSelf: 10,
    })
    expect(summary.sampleCount).toBe(10)
    expect(summary.topSelf).toEqual([
      { frame: 'hotLoop common/lib/calc.js:42:1', samples: 6, pct: 60 },
      { frame: '(garbage collector)', samples: 2, pct: 20 },
      { frame: '(program)', samples: 1, pct: 10 },
      {
        frame: 'handler backend/api/lib/place-bet.js:10:1',
        samples: 1,
        pct: 10,
      },
    ])
  })

  it('reports the hottest stacks leaf first, without (root)', () => {
    const summary = summarizeCpuProfile(profile, {
      maxStacks: 2,
      maxFrames: 10,
      maxSelf: 10,
    })
    expect(summary.topStacks).toEqual([
      {
        samples: 6,
        pct: 60,
        frames: [
          'hotLoop common/lib/calc.js:42:1',
          'handler backend/api/lib/place-bet.js:10:1',
        ],
      },
      {
        samples: 2,
        pct: 20,
        frames: [
          '(garbage collector)',
          'handler backend/api/lib/place-bet.js:10:1',
        ],
      },
    ])
  })

  it('truncates stacks to maxFrames from the leaf', () => {
    const summary = summarizeCpuProfile(profile, {
      maxStacks: 1,
      maxFrames: 1,
      maxSelf: 1,
    })
    expect(summary.topStacks[0].frames).toEqual([
      'hotLoop common/lib/calc.js:42:1',
    ])
    expect(summary.topSelf).toHaveLength(1)
  })

  it('handles a profile with no samples', () => {
    const summary = summarizeCpuProfile(
      { ...profile, samples: undefined },
      { maxStacks: 5, maxFrames: 10, maxSelf: 10 }
    )
    expect(summary).toEqual({ sampleCount: 0, topSelf: [], topStacks: [] })
  })
})

describe('formatCallFrame', () => {
  it('names anonymous functions and keeps non-app urls whole', () => {
    expect(formatCallFrame(frame('', 'node:internal/timers', 3))).toBe(
      '(anonymous) node:internal/timers:4:1'
    )
  })
})
