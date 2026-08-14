import {
  identifierTokens,
  proposedRepoMatchesModel,
  weightsRepoNameOverlap,
} from './weights-repo-match'

describe('identifierTokens', () => {
  it('drops the org, splits digits from letters, and strips noise', () => {
    expect(identifierTokens('deepseek/deepseek-v4-pro-20260813')).toEqual([
      'deepseek',
      'v4',
      'pro',
    ])
    expect(identifierTokens('deepseek-ai/DeepSeek-V4-Pro-0813')).toEqual([
      'deepseek',
      'v4',
      'pro',
    ])
  })

  it('keeps version numbers attached to their letter', () => {
    // `v4` and `k2` discriminate; a bare `70` or `2507` does not.
    expect(identifierTokens('moonshotai/Kimi-K2-Instruct-0905')).toEqual([
      'kimi',
      'k2',
    ])
  })
})

describe('the repos that actually froze the feed', () => {
  it('accepts the real weights repo for each open model', () => {
    const realPairs: [string, string][] = [
      [
        'deepseek/deepseek-v4-pro-20260813',
        'deepseek-ai/DeepSeek-V4-Pro-0813',
      ],
      [
        'nvidia/nemotron-3.5-lightning-20260807',
        'nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-BF16',
      ],
      ['moonshotai/kimi-k2.5-0127', 'moonshotai/Kimi-K2.5'],
      ['qwen/qwen3-coder-480b-a35b-07-25', 'Qwen/Qwen3-Coder-480B-A35B-Instruct'],
      ['z-ai/glm-5.2-20260616', 'zai-org/GLM-5.2'],
    ]
    for (const [permaslug, repo] of realPairs)
      expect([permaslug, proposedRepoMatchesModel(permaslug, repo)]).toEqual([
        permaslug,
        true,
      ])
  })

  it('rejects the real-but-wrong repo that motivates the guard', () => {
    // Solar Open2 is a genuine, public, weight-bearing Upstage repo — and a
    // different model from Solar Pro 4. Verification alone would accept it.
    expect(
      proposedRepoMatchesModel(
        'upstage/solar-pro4-20260810',
        'upstage/Solar-Open2-250B'
      )
    ).toBe(false)
  })

  it('rejects a same-org repo for an unrelated model family', () => {
    expect(
      proposedRepoMatchesModel('x-ai/grok-4.6-20260810', 'xai-org/grok-1')
    ).toBe(false)
    expect(
      proposedRepoMatchesModel(
        'deepseek/deepseek-v4-pro-20260813',
        'deepseek-ai/DeepSeek-R1'
      )
    ).toBe(false)
  })
})

describe('weightsRepoNameOverlap', () => {
  it('is measured over the model tokens, so extra repo tokens are free', () => {
    // Size and precision suffixes are normal on a weights repo and must not
    // count against it.
    expect(
      weightsRepoNameOverlap(
        'qwen/qwen3-30b-a3b-instruct-2507',
        'Qwen/Qwen3-30B-A3B-Instruct-2507'
      )
    ).toBe(1)
  })

  it('scores zero when the model names something the repo lacks', () => {
    expect(weightsRepoNameOverlap('newlab/aurora-1', 'otherlab/Zephyr-7B')).toBe(
      0
    )
  })

  it('never divides by zero on a degenerate identifier', () => {
    expect(weightsRepoNameOverlap('org/', 'org/Something')).toBe(0)
    expect(weightsRepoNameOverlap('', '')).toBe(0)
  })
})
