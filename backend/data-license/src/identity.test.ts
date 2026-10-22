import {
  NameIndex,
  NameRecord,
  isHandleLike,
  rewriteBareNames,
  rewriteIdentityInString,
  rewriteNameHandlePairs,
} from './identity'
import { Pseudonymizer } from './pseudonymize'
import { buildDeliveryReadme } from './delivery-readme'
import { Manifest } from './manifest'
import {
  REDACTORS,
  RedactContext,
  Row,
  commentTextShips,
  identityContext,
  newStats,
} from './redact'
import {
  ScanArgs,
  emptyCounts,
  addCounts,
  nameScanSelfTest,
  scanBatch,
} from './validate'

// Fake 28-character uids, shaped like Firebase ids.
const QUORVEL = 'quorvelQQQQQQQQQQQQQQQQQQQQ1'
const BRAMBLE = 'brambleBBBBBBBBBBBBBBBBBBBB2'
const VELMORIN = 'velmorinVVVVVVVVVVVVVVVVVVV3'
const ZEPHYR = 'zephyrinZZZZZZZZZZZZZZZZZZZ4'
const DUP1 = 'dupOneDDDDDDDDDDDDDDDDDDDDD5'
const DUP2 = 'dupTwoDDDDDDDDDDDDDDDDDDDDD6'
const LEGACY_ROUTE = 'legacyLLLLLLLLLLLLLLLLLLLLL7'
const ZANDER = 'zanderZZZZZZZZZZZZZZZZZZZZZ8'
const LOOKALIKE = 'lookalikeLLLLLLLLLLLLLLLLLL9'

const RECORDS: NameRecord[] = [
  { id: QUORVEL, username: 'Quorvel_17', name: 'Wrenna Quorvel' },
  { id: BRAMBLE, username: 'BramblePike', name: 'Pikeling' },
  { id: VELMORIN, username: 'velmorin', name: 'Velmorin' },
  { id: ZEPHYR, username: 'zephyrin', name: 'xX_zephyr_Xx' },
  { id: DUP1, username: 'Dup_7q', name: 'Duplo Q' },
  // historical: Quorvel's old name from an edit snapshot, a name two users had,
  // and a legacy account that holds a name that is now a route
  { id: QUORVEL, username: 'OldQuorvel3', name: null },
  { id: DUP2, username: 'dup_7q', name: null },
  { id: LEGACY_ROUTE, username: 'complexsystems', name: null },
  // a handle that is also a common word, and a real username shaped like our
  // output
  { id: ZANDER, username: 'ZanderMode', name: null },
  { id: LOOKALIKE, username: 'User_0123456789abcdef0123', name: null },
]

const ps = new Pseudonymizer(Buffer.from('fixture-salt'), 'User_', 20)
const P = (id: string) => ps.map(id)

function makeCtx(over: Partial<RedactContext> = {}): RedactContext {
  const names = NameIndex.fromRecords(RECORDS)
  // BramblePike is a handle that turns up all over the prose: not rare
  for (let i = 0; i < 21; i++)
    names.countProseRow(new Set(['bramblepike', 'zandermode']))
  names.countProseRow(new Set(['quorvel_17']))
  names.setRareThreshold(20)
  return {
    ps,
    stats: newStats(),
    deletedUserIds: new Set(),
    deletedAccountMode: 'redact',
    knownUserIds: new Set([
      QUORVEL,
      BRAMBLE,
      VELMORIN,
      ZEPHYR,
      DUP1,
      DUP2,
      LEGACY_ROUTE,
      ZANDER,
      LOOKALIKE,
    ]),
    scopedContractIds: new Set(['c1']),
    names,
    bareUsernames: true,
    blankModeratedComments: false,
    scrubDescriptions: false,
    ...over,
  }
}

function rewrite(s: string, ctx = makeCtx()): string {
  const idCtx = identityContext(ctx)
  if (!idCtx) throw new Error('no names')
  return rewriteIdentityInString(s, idCtx)
}

const doc = (text: string, href?: string) => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        href
          ? { type: 'text', text, marks: [{ type: 'link', attrs: { href } }] }
          : { type: 'text', text },
      ],
    },
  ],
})

function contractRow(
  data: Record<string, any>,
  cols: Record<string, any> = {}
): Row {
  return {
    id: 'c1',
    slug: 'will-it-rain',
    question: data.question ?? 'Will it rain?',
    creator_id: QUORVEL,
    ...cols,
    data: { id: 'c1', question: 'Will it rain?', creatorId: QUORVEL, ...data },
  }
}

describe('isHandleLike', () => {
  test.each([
    ['Quorvel_17', true],
    ['BramblePike', true],
    ['xX_zephyr_Xx', true],
    ['velmorin', false], // ordinary word
    ['Apple', false],
    ['Quill2031', true],
    ['12345', false], // a number
    ['2025-01-31', false], // a date
    ['abc1', false], // too short
    ['Ostrander Quill', false], // display names with spaces are not single words
  ])('%s -> %s', (w, expected) => expect(isHandleLike(w)).toBe(expected))
})

describe('storage paths', () => {
  test('percent-encoded Firebase cover URL keeps the file and token', () => {
    const url =
      'https://firebasestorage.googleapis.com/v0/b/mantic-markets.appspot.com/o/' +
      'contract-images%2FQuorvel_17%2Fabc123.jpg?alt=media&token=0f0e'
    expect(rewrite(url)).toBe(
      'https://firebasestorage.googleapis.com/v0/b/mantic-markets.appspot.com/o/' +
        `contract-images%2F${P(QUORVEL)}%2Fabc123.jpg?alt=media&token=0f0e`
    )
  })

  test('plain storage path, with a sub-folder', () => {
    expect(
      rewrite(
        'https://storage.googleapis.com/b/user-images/BramblePike/yap/x.png'
      )
    ).toBe(
      `https://storage.googleapis.com/b/user-images/${P(BRAMBLE)}/yap/x.png`
    )
  })

  test('historical username resolves to its owner', () => {
    expect(rewrite('contract-images/OldQuorvel3/x.jpg')).toBe(
      `contract-images/${P(QUORVEL)}/x.jpg`
    )
  })

  test('unknown username becomes the placeholder; the shared folder stays', () => {
    const ctx = makeCtx()
    expect(rewrite('contract-images/Nobodyx404/x.jpg', ctx)).toBe(
      'contract-images/User_unknown/x.jpg'
    )
    expect(ctx.stats.usernamesUnresolved).toBe(1)
    expect(rewrite('user-images/default/x.png')).toBe(
      'user-images/default/x.png'
    )
  })

  test('a username two users have had is not guessed', () => {
    expect(rewrite('user-images/DUP_1/x.png')).toBe(
      'user-images/User_unknown/x.png'
    )
  })

  test('private-images carries a user id', () => {
    expect(rewrite('private-images/' + VELMORIN + '/x.png')).toBe(
      `private-images/${P(VELMORIN)}/x.png`
    )
  })
})

describe('manifold.markets links', () => {
  test('market link: username rewritten, slug and fragment kept, referral dropped', () => {
    expect(
      rewrite(
        'https://manifold.markets/Quorvel_17/will-it-rain?r=UXVvcnZlbF8xNw#comment-1'
      )
    ).toBe(`https://manifold.markets/${P(QUORVEL)}/will-it-rain#comment-1`)
  })

  test('bare host in prose, trailing punctuation kept', () => {
    expect(rewrite('see manifold.markets/BramblePike/some-slug.')).toBe(
      `see manifold.markets/${P(BRAMBLE)}/some-slug.`
    )
    expect(rewrite('(www.manifold.markets/velmorin)')).toBe(
      `(www.manifold.markets/${P(VELMORIN)})`
    )
  })

  test('embed links; embed routes stay', () => {
    expect(rewrite('https://manifold.markets/embed/Quorvel_17/slug')).toBe(
      `https://manifold.markets/embed/${P(QUORVEL)}/slug`
    )
    expect(rewrite('https://manifold.markets/embed/grid/abc')).toBe(
      'https://manifold.markets/embed/grid/abc'
    )
  })

  test('routes and files are never usernames', () => {
    for (const url of [
      'https://manifold.markets/news/some-article',
      'https://manifold.markets/browse?topic=ai',
      'https://manifold.markets/topic/elections',
      'https://manifold.markets/logo.png',
      'https://manifold.markets/images/x.png',
    ]) {
      expect(rewrite(url)).toBe(url)
    }
  })

  test('user API path and username param', () => {
    expect(rewrite('https://manifold.markets/api/v0/user/BramblePike')).toBe(
      `https://manifold.markets/api/v0/user/${P(BRAMBLE)}`
    )
    expect(
      rewrite('https://manifold.markets/api/v0/bets?username=velmorin&limit=5')
    ).toBe(
      `https://manifold.markets/api/v0/bets?username=${P(VELMORIN)}&limit=5`
    )
  })

  test('referrer= fallback form is dropped too', () => {
    expect(
      rewrite('https://manifold.markets/velmorin?referrer=Quorvel_17&tab=x')
    ).toBe(`https://manifold.markets/${P(VELMORIN)}?tab=x`)
  })

  test('docs subdomain and other hosts keep their paths', () => {
    for (const url of [
      'https://docs.manifold.markets/Quorvel_17/x',
      'https://twitter.com/Quorvel_17/status/1',
    ]) {
      expect(rewrite(url)).toBe(url)
    }
  })
})

describe('preview URLs', () => {
  test('creator params dropped, the rest kept in order', () => {
    const avatar = encodeURIComponent(
      'https://firebasestorage.googleapis.com/v0/b/x/o/user-images%2FQuorvel_17%2Fa.png'
    )
    const url =
      'https://manifold.markets/api/og/market?question=Will%20it%20rain&numTraders=3' +
      `&creatorName=Wrenna%20Quorvel&creatorAvatarUrl=${avatar}&creatorUsername=Quorvel_17` +
      '&probability=40%25'
    expect(rewrite(url)).toBe(
      'https://manifold.markets/api/og/market?question=Will%20it%20rain&numTraders=3&probability=40%25'
    )
  })

  test('old og-image host and HTML-escaped ampersands', () => {
    expect(
      rewrite(
        'https://manifold-og-image.vercel.app/m.png?question=Q&creatorName=A&creatorUsername=Quorvel_17'
      )
    ).toBe('https://manifold-og-image.vercel.app/m.png?question=Q')
    expect(
      rewrite(
        'https://manifold.markets/api/og/market?question=Q&amp;creatorName=A&amp;volume=5'
      )
    ).toBe('https://manifold.markets/api/og/market?question=Q&amp;volume=5')
  })

  test('a preview URL nested in an image proxy param', () => {
    const inner =
      'https://manifold.markets/api/og/market?question=Q&creatorName=Wrenna'
    const url = `https://manifold.markets/_next/image?url=${encodeURIComponent(
      inner
    )}&w=640`
    expect(rewrite(url)).toBe(
      `https://manifold.markets/_next/image?url=${encodeURIComponent(
        'https://manifold.markets/api/og/market?question=Q'
      )}&w=640`
    )
  })
})

describe('contracts through the redactor', () => {
  test('cover image, description link + text, prose, slug', () => {
    const ctx = makeCtx()
    const out = REDACTORS.contracts(
      contractRow(
        {
          creatorUsername: 'Quorvel_17',
          creatorName: 'Wrenna Quorvel',
          coverImageUrl:
            'https://firebasestorage.googleapis.com/v0/b/m/o/contract-images%2FQuorvel_17%2Fc.jpg?alt=media',
          description: doc(
            'Ask Quorvel_17 or BramblePike, not Velmorin. Quorvel_17-style. See manifold.markets/BramblePike/x',
            'https://manifold.markets/Quorvel_17/will-it-rain'
          ),
        },
        { question: 'Will Quorvel_17 post?', slug: 'will-quorvel_17-post' }
      ),
      ctx
    ) as Row
    const a = P(QUORVEL)
    expect(out.data.creatorUsername).toBeUndefined()
    expect(out.data.creatorName).toBeUndefined()
    expect(out.data.coverImageUrl).toContain(`contract-images%2F${a}%2Fc.jpg`)
    const node = out.data.description.content[0].content[0]
    expect(node.marks[0].attrs.href).toBe(
      `https://manifold.markets/${a}/will-it-rain`
    )
    // rare handle replaced, common handle and ordinary words kept, dashed word
    // split, link left to the URL rules
    expect(node.text).toBe(
      `Ask ${a} or BramblePike, not Velmorin. ${a}-style. See manifold.markets/${P(
        BRAMBLE
      )}/x`
    )
    expect(out.question).toBe(`Will ${a} post?`)
    expect(out.data.question).toBe('Will it rain?')
    expect(out.slug).toBe('will-quorvel_17-post') // slugs are kept…
    expect(ctx.stats.slugsWithRareHandle).toBe(1) // …and counted
    expect(ctx.stats.bareUsernamesReplaced).toBe(3)
  })

  test('handle-like display name in prose maps to its owner', () => {
    const out = REDACTORS.contracts(
      contractRow({ description: doc('xX_zephyr_Xx says hi') }),
      makeCtx()
    ) as Row
    expect(out.data.description.content[0].content[0].text).toBe(
      `${P(ZEPHYR)} says hi`
    )
  })

  test('words inside external links are left alone', () => {
    const out = REDACTORS.contracts(
      contractRow({
        description: doc('source: https://twitter.com/Quorvel_17/status/1'),
      }),
      makeCtx()
    ) as Row
    expect(out.data.description.content[0].content[0].text).toBe(
      'source: https://twitter.com/Quorvel_17/status/1'
    )
  })

  test('bare-word rule off: prose untouched, URLs still rewritten', () => {
    const out = REDACTORS.contracts(
      contractRow({
        description: doc(
          'Ask Quorvel_17',
          'https://manifold.markets/Quorvel_17/x'
        ),
      }),
      makeCtx({ bareUsernames: false })
    ) as Row
    const node = out.data.description.content[0].content[0]
    expect(node.text).toBe('Ask Quorvel_17')
    expect(node.marks[0].attrs.href).toBe(
      `https://manifold.markets/${P(QUORVEL)}/x`
    )
  })

  test('string rewrites are idempotent', () => {
    const ctx = makeCtx()
    const idCtx = identityContext(ctx)
    if (!idCtx) throw new Error('no names')
    for (const s of [
      'contract-images/Quorvel_17/c.jpg',
      'Quorvel_17 at manifold.markets/velmorin and https://manifold.markets/Nobodyx9/x',
      'https://manifold.markets/api/og/market?question=Q&creatorName=A',
    ]) {
      const once = rewriteBareNames(rewriteIdentityInString(s, idCtx), idCtx)
      expect(
        rewriteBareNames(rewriteIdentityInString(once, idCtx), idCtx)
      ).toBe(once)
    }
  })

  test('embedded answers: text rewritten, legacy identity and search vector stripped', () => {
    const out = REDACTORS.contracts(
      contractRow({
        answers: [
          {
            id: 'a1',
            text: 'Quorvel_17',
            userId: BRAMBLE,
            username: 'BramblePike',
            textFts: "'quorvel_17':1",
          },
        ],
      }),
      makeCtx()
    ) as Row
    expect(out.data.answers[0]).toEqual({
      id: 'a1',
      text: P(QUORVEL),
      userId: P(BRAMBLE),
    })
  })
})

describe('comments and answers through the redactor', () => {
  test('comment content, legacy text and the copied question', () => {
    const out = REDACTORS.contract_comments(
      {
        comment_id: 'm1',
        contract_id: 'c1',
        user_id: BRAMBLE,
        data: {
          id: 'm1',
          userId: BRAMBLE,
          userUsername: 'BramblePike',
          contractQuestion: 'Will Quorvel_17 post?',
          content: doc(
            'cc Quorvel_17, see https://manifold.markets/Quorvel_17/x?r=UXVvcnZlbF8xNw'
          ),
          text: 'Quorvel_17',
        },
      },
      makeCtx()
    ) as Row
    const a = P(QUORVEL)
    expect(out.data.userUsername).toBeUndefined()
    expect(out.data.content.content[0].content[0].text).toBe(
      `cc ${a}, see https://manifold.markets/${a}/x`
    )
    expect(out.data.text).toBe(a)
    expect(out.data.contractQuestion).toBe(`Will ${a} post?`)
  })

  test('answers table text and image url', () => {
    const out = REDACTORS.answers(
      {
        id: 'a1',
        contract_id: 'c1',
        user_id: VELMORIN,
        text: 'Quorvel_17',
        image_url:
          'https://storage.googleapis.com/b/user-images/velmorin/x.png',
      },
      makeCtx()
    ) as Row
    expect(out.text).toBe(P(QUORVEL))
    expect(out.image_url).toBe(
      `https://storage.googleapis.com/b/user-images/${P(VELMORIN)}/x.png`
    )
  })
})

describe('name scan (validator)', () => {
  const scanArgs = (
    ctx: RedactContext,
    over: Partial<ScanArgs> = {}
  ): ScanArgs => ({
    deliveredContractIds: new Set(['c1']),
    allUserIds: ctx.knownUserIds,
    forbiddenStrings: [],
    names: ctx.names,
    ps,
    failOnBareNames: true,
    ...over,
  })

  const leaky = () =>
    contractRow({
      coverImageUrl:
        'https://firebasestorage.googleapis.com/v0/b/m/o/contract-images%2FQuorvel_17%2Fc.jpg',
      description: doc(
        'Quorvel_17 https://manifold.markets/velmorin/x?r=UXVvcnZlbF8xNw',
        'https://manifold.markets/api/og/market?question=Q&creatorName=Wrenna'
      ),
    })

  test('counts each shape on a raw row, nothing after redaction', () => {
    const ctx = makeCtx()
    const raw = scanBatch('contracts', [leaky()], scanArgs(ctx))
    expect(raw.namePathLeaks).toBe(2) // cover path + link user segment
    expect(raw.nameQueryLeaks).toBe(1) // ?r=
    expect(raw.previewParamLeaks).toBe(1)
    expect(raw.bareNameHits).toBe(1)

    const redacted = REDACTORS.contracts(leaky(), ctx) as Row
    const after = scanBatch('contracts', [redacted], scanArgs(ctx))
    const total = emptyCounts()
    addCounts(total, after)
    expect(total).toMatchObject({
      namePathLeaks: 0,
      nameQueryLeaks: 0,
      previewParamLeaks: 0,
      bareNameHits: 0,
      rawIdLeaks: 0,
      unknownKeys: 0,
    })
  })

  test('sees through double encoding the rewriter does not parse', () => {
    const ctx = makeCtx()
    const row = contractRow({
      description: doc(
        'x',
        'https%253A%252F%252Fmanifold.markets%252FQuorvel_17%252Fslug'
      ),
    })
    expect(scanBatch('contracts', [row], scanArgs(ctx)).namePathLeaks).toBe(1)
  })

  test('with the rewrite off, rare handles are reported, not gated', () => {
    const ctx = makeCtx({ bareUsernames: false })
    const row = REDACTORS.contracts(
      contractRow({ description: doc('Quorvel_17') }),
      ctx
    ) as Row
    const c = scanBatch(
      'contracts',
      [row],
      scanArgs(ctx, { failOnBareNames: false })
    )
    expect(c.bareNameHits).toBe(0)
    expect(c.bareNameWarnings).toBe(1)
  })

  test('self-test catches every planted shape', () => {
    expect(nameScanSelfTest(scanArgs(makeCtx()))).toEqual([])
  })

  test('self-test reports the shapes a broken scan misses', () => {
    // a scan whose username lookup never matches (the pick still works)
    class BlindMap<K, V> extends Map<K, V> {
      has(): boolean {
        return false
      }
    }
    const ctx = makeCtx()
    const names = ctx.names as NameIndex
    const blind = Object.create(names) as NameIndex
    Object.defineProperty(blind, 'usernames', {
      value: new BlindMap(names.usernames),
    })
    expect(nameScanSelfTest(scanArgs(ctx, { names: blind }))).toEqual([
      'storage path',
      'market link',
      'relative path',
      'referral param',
      'comment @handle',
    ])
  })
})

// Shapes found by an independent review (verified leaks or false gates before
// the fix).
describe('review findings', () => {
  const scanArgs = (ctx: RedactContext): ScanArgs => ({
    deliveredContractIds: new Set(['c1']),
    allUserIds: ctx.knownUserIds,
    forbiddenStrings: [],
    names: ctx.names,
    ps,
    failOnBareNames: true,
  })
  const leaksIn = (text: string, ctx = makeCtx()) => {
    const c = scanBatch(
      'contracts',
      [contractRow({ description: doc(text) })],
      scanArgs(ctx)
    )
    return (
      c.namePathLeaks + c.nameQueryLeaks + c.previewParamLeaks + c.bareNameHits
    )
  }

  test('contract mention labels and relative hrefs are links', () => {
    const description = () => ({
      type: 'doc',
      content: [
        {
          type: 'contract-mention',
          attrs: { id: 'c9', label: '/velmorin/will-it-rain' },
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'x',
              marks: [{ type: 'link', attrs: { href: '/Quorvel_17/y' } }],
            },
          ],
        },
      ],
    })
    const ctx = makeCtx()
    const raw = scanBatch(
      'contracts',
      [contractRow({ description: description() })],
      scanArgs(ctx)
    )
    expect(raw.namePathLeaks).toBe(2)
    const out = REDACTORS.contracts(
      contractRow({ description: description() }),
      ctx
    ) as Row
    expect(out.data.description.content[0].attrs.label).toBe(
      `/${P(VELMORIN)}/will-it-rain`
    )
    expect(out.data.description.content[1].content[0].marks[0].attrs.href).toBe(
      `/${P(QUORVEL)}/y`
    )
    const after = scanBatch('contracts', [out], scanArgs(ctx))
    expect(after.namePathLeaks).toBe(0)
  })

  test('a lone relative segment is only rewritten for a known username', () => {
    expect(rewrite('/jk')).toBe('/jk')
    expect(rewrite('/velmorin')).toBe(`/${P(VELMORIN)}`)
    expect(rewrite('/r/wallstreetbets')).toBe('/r/wallstreetbets')
  })

  test('markdown link to a relative path: user rewritten, slug kept', () => {
    const out = REDACTORS.contracts(
      contractRow({
        description: doc('[market](/velmorin/will-Quorvel_17-win)'),
      }),
      makeCtx()
    ) as Row
    expect(out.data.description.content[0].content[0].text).toBe(
      `[market](/${P(VELMORIN)}/will-Quorvel_17-win)`
    )
  })

  test('link preview title/description and image alt are prose', () => {
    const description = () => ({
      type: 'doc',
      content: [
        {
          type: 'linkPreview',
          attrs: {
            url: 'https://example.com',
            title: 'Quorvel_17',
            description: 'Quorvel_17 forecasts',
          },
        },
        {
          type: 'image',
          attrs: { src: 'https://example.com/a.png', alt: 'by Quorvel_17' },
        },
      ],
    })
    const ctx = makeCtx()
    const raw = scanBatch(
      'contracts',
      [contractRow({ description: description() })],
      scanArgs(ctx)
    )
    expect(raw.bareNameHits).toBe(3)
    const out = REDACTORS.contracts(
      contractRow({ description: description() }),
      ctx
    ) as Row
    const a = P(QUORVEL)
    expect(out.data.description.content[0].attrs).toMatchObject({
      title: a,
      description: `${a} forecasts`,
    })
    expect(out.data.description.content[1].attrs.alt).toBe(`by ${a}`)
  })

  test('host-only and port forms', () => {
    expect(rewrite('https://manifold.markets?r=UXVvcnZlbF8xNw')).toBe(
      'https://manifold.markets'
    )
    expect(rewrite('https://manifold.markets?referrer=velmorin&tab=x')).toBe(
      'https://manifold.markets?tab=x'
    )
    expect(rewrite('https://manifold.markets:443/velmorin/slug')).toBe(
      `https://manifold.markets:443/${P(VELMORIN)}/slug`
    )
    expect(
      leaksIn(
        'https://manifold.markets:443/velmorin/slug https://manifold.markets?r=UXVvcnZlbF8xNw'
      )
    ).toBe(2)
  })

  test('encoded param names, HTML entities and JSON-escaped slashes', () => {
    const cases: [string, string][] = [
      [
        'https://og.example.app/m.png?q=1&%63reatorUsername=velmorin',
        'https://og.example.app/m.png?q=1',
      ],
      [
        'https://manifold.markets/news?x=1&#38;creatorUsername=velmorin',
        'https://manifold.markets/news?x=1',
      ],
      [
        '{"href":"https:\\/\\/manifold.markets\\/velmorin\\/slug"}',
        `{"href":"https://manifold.markets/${P(VELMORIN)}/slug"}`,
      ],
      [
        'contract-images%25252Fvelmorin%25252Fx.jpg',
        `contract-images%25252F${P(VELMORIN)}%25252Fx.jpg`,
      ],
    ]
    for (const [input, expected] of cases) {
      expect(rewrite(input)).toBe(expected)
      expect(leaksIn(input)).toBeGreaterThan(0)
      expect(leaksIn(expected)).toBe(0)
    }
  })

  test('route names only exempt the first segment; real users beat the pseudonym shape', () => {
    expect(rewrite('https://manifold.markets/embed/complexsystems/slug')).toBe(
      `https://manifold.markets/embed/${P(LEGACY_ROUTE)}/slug`
    )
    expect(
      rewrite('https://manifold.markets/User_0123456789abcdef0123/slug')
    ).toBe(`https://manifold.markets/${P(LOOKALIKE)}/slug`)
  })

  test('params after a nested URL are still checked; rare values rewritten', () => {
    const url =
      'https://manifold.markets/news?next=https://example.com&owner=Quorvel_17'
    expect(leaksIn(url)).toBe(1)
    expect(rewrite(url)).toBe(
      `https://manifold.markets/news?next=https://example.com&owner=${P(
        QUORVEL
      )}`
    )
  })

  test('a common query value that equals a handle is neither rewritten nor gated', () => {
    const url = 'https://manifold.markets/browse?sort=zandermode'
    expect(rewrite(url)).toBe(url)
    expect(leaksIn(url)).toBe(0)
  })
})

describe('rarity tally input', () => {
  test('text that will not ship is not counted', () => {
    const deleted = new Set([BRAMBLE])
    const row = (user_id: string, flags: Record<string, boolean> = {}) => ({
      user_id,
      data: { ...flags },
    })
    expect(commentTextShips(row(QUORVEL), deleted, false)).toBe(true)
    expect(commentTextShips(row(BRAMBLE), deleted, false)).toBe(false)
    expect(
      commentTextShips(row(QUORVEL, { hidden: true }), deleted, false)
    ).toBe(true)
    expect(
      commentTextShips(row(QUORVEL, { hidden: true }), deleted, true)
    ).toBe(false)
    expect(
      commentTextShips(row(QUORVEL, { deleted: true }), deleted, true)
    ).toBe(false)
  })
})

// Found by the dev dry-run spot check: dating-market answers read
// "Real Name (@username)"; replacing the handle alone left the name.
describe('display name next to its handle', () => {
  const scanArgs = (ctx: RedactContext): ScanArgs => ({
    deliveredContractIds: new Set(['c1']),
    allUserIds: ctx.knownUserIds,
    forbiddenStrings: [],
    names: ctx.names,
    ps,
    failOnBareNames: true,
  })

  test('answers, description and comments: name and handle both replaced', () => {
    const ctx = makeCtx()
    const a = P(QUORVEL)
    const b = P(BRAMBLE)
    const out = REDACTORS.contracts(
      contractRow({
        description: doc(
          'Candidates: Wrenna Quorvel (@Quorvel_17) and Pikeling (@BramblePike).'
        ),
        answers: [{ id: 'a1', text: 'Wrenna Quorvel (@Quorvel_17)' }],
      }),
      ctx
    ) as Row
    expect(out.data.description.content[0].content[0].text).toBe(
      `Candidates: ${a} (@${a}) and ${b} (@${b}).`
    )
    expect(out.data.answers[0].text).toBe(`${a} (@${a})`)
    expect(ctx.stats.nameHandlePairsReplaced).toBe(3)

    // comments: before the scrub turns the handle into @user
    const comment = REDACTORS.contract_comments(
      {
        comment_id: 'm1',
        contract_id: 'c1',
        user_id: VELMORIN,
        data: {
          id: 'm1',
          userId: VELMORIN,
          content: doc('I pick Wrenna  Quorvel (@Quorvel_17)!'),
        },
      },
      ctx
    ) as Row
    expect(comment.data.content.content[0].content[0].text).toBe(
      `I pick ${a} (@user)!`
    )
  })

  test("someone else's name, or a handle that is no user, stays", () => {
    const idCtx = identityContext(makeCtx())
    if (!idCtx) throw new Error('no names')
    expect(rewriteNameHandlePairs('Cassius Vane (@cassiusvane)', idCtx)).toBe(
      'Cassius Vane (@cassiusvane)'
    )
    expect(
      rewriteNameHandlePairs('Pikeling (@Quorvel_17) says hi', idCtx)
    ).toBe('Pikeling (@Quorvel_17) says hi')
    expect(rewriteNameHandlePairs('Velmorin said (@velmorin)', idCtx)).toBe(
      'Velmorin said (@velmorin)'
    )
  })

  test('the scan gates on a pair left behind', () => {
    const ctx = makeCtx()
    const row = contractRow({
      answers: [{ id: 'a1', text: 'Pikeling (@BramblePike)' }],
    })
    expect(scanBatch('contracts', [row], scanArgs(ctx)).namePairLeaks).toBe(1)
    const out = REDACTORS.contracts(
      contractRow({ answers: [{ id: 'a1', text: 'Pikeling (@BramblePike)' }] }),
      ctx
    ) as Row
    expect(scanBatch('contracts', [out], scanArgs(ctx)).namePairLeaks).toBe(0)
  })
})

describe('@handles', () => {
  const scanArgs = (
    ctx: RedactContext,
    scrubDescriptions: boolean
  ): ScanArgs => ({
    deliveredContractIds: new Set(['c1']),
    allUserIds: ctx.knownUserIds,
    forbiddenStrings: [],
    names: ctx.names,
    ps,
    failOnBareNames: true,
    scrubDescriptions,
  })
  const text = 'Ping @velmorin, @velmorin-x9 and @quillgazette; mail a@b.co'

  test('descriptions: only handles of Manifold users are rewritten', () => {
    const ctx = makeCtx({ scrubDescriptions: true })
    const out = REDACTORS.contracts(
      contractRow({ description: doc(text) }),
      ctx
    ) as Row
    const v = P(VELMORIN)
    expect(out.data.description.content[0].content[0].text).toBe(
      `Ping @${v}, @${v}-x9 and @quillgazette; mail [email removed]`
    )
    expect(ctx.stats.descriptionHandlesRewritten).toBe(2)
    // a legacy plain-string description too
    const legacy = REDACTORS.contracts(
      contractRow({ description: 'cc @velmorin' }),
      ctx
    ) as Row
    expect(legacy.data.description).toBe(`cc @${v}`)
  })

  test('descriptions are left alone with SCRUB_DESCRIPTIONS off', () => {
    const out = REDACTORS.contracts(
      contractRow({ description: doc(text) }),
      makeCtx({ scrubDescriptions: false })
    ) as Row
    expect(out.data.description.content[0].content[0].text).toBe(text)
  })

  test('comments keep the blunt rule: every @handle becomes @user', () => {
    const out = REDACTORS.contract_comments(
      {
        comment_id: 'm1',
        contract_id: 'c1',
        user_id: ZEPHYR,
        data: { id: 'm1', userId: ZEPHYR, content: doc(text) },
      },
      makeCtx()
    ) as Row
    expect(out.data.content.content[0].content[0].text).toBe(
      'Ping @user, @user and @user; mail [email removed]'
    )
  })

  test('the scan gates on a user handle left behind', () => {
    const ctx = makeCtx({ scrubDescriptions: true })
    const raw = () => contractRow({ description: doc('cc @velmorin') })
    expect(
      scanBatch('contracts', [raw()], scanArgs(ctx, true)).atHandleLeaks
    ).toBe(1)
    // not checked when descriptions aren't scrubbed
    expect(
      scanBatch('contracts', [raw()], scanArgs(ctx, false)).atHandleLeaks
    ).toBe(0)
    const out = REDACTORS.contracts(raw(), ctx) as Row
    expect(
      scanBatch('contracts', [out], scanArgs(ctx, true)).atHandleLeaks
    ).toBe(0)

    const comment = () => ({
      comment_id: 'm1',
      contract_id: 'c1',
      user_id: ZEPHYR,
      data: { id: 'm1', userId: ZEPHYR, text: 'thanks @velmorin' },
    })
    expect(
      scanBatch('contract_comments', [comment()], scanArgs(ctx, true))
        .atHandleLeaks
    ).toBe(1)
    const scrubbed = REDACTORS.contract_comments(comment(), ctx) as Row
    expect(
      scanBatch('contract_comments', [scrubbed], scanArgs(ctx, true))
        .atHandleLeaks
    ).toBe(0)
  })

  test("our @user placeholder isn't a leak even if someone is named user", () => {
    const ctx = makeCtx()
    const names = NameIndex.fromRecords([
      ...RECORDS,
      { id: LOOKALIKE, username: 'user' },
    ])
    const row = {
      comment_id: 'm1',
      contract_id: 'c1',
      user_id: ZEPHYR,
      data: { id: 'm1', userId: ZEPHYR, text: 'thanks @user' },
    }
    expect(
      scanBatch('contract_comments', [row], { ...scanArgs(ctx, true), names })
        .atHandleLeaks
    ).toBe(0)
  })
})

describe('delivery README policy text', () => {
  const manifest = (redaction: Record<string, unknown>) =>
    ({
      deliveryDate: '2030-01-01',
      snapshotTime: 't',
      schemaVersion: '1.2.0',
      saltFingerprint: 'f',
      filter: { visibility: 'public', deleted: false, note: '' },
      segments: {},
      tables: {},
      redaction,
    } as unknown as Manifest)

  test('says what the run did', () => {
    const on = buildDeliveryReadme(
      manifest({
        bareUsernameRewrite: true,
        bareUsernameMaxRows: 20,
        blankModeratedComments: true,
        scrubDescriptions: true,
      })
    )
    expect(on).toContain(
      "An @-mention of a Manifold user is replaced by that user's pseudonym"
    )
    expect(on).toContain('keep their row and flags, but their text is removed')
    const off = buildDeliveryReadme(
      manifest({
        bareUsernameRewrite: false,
        bareUsernameMaxRows: 20,
        blankModeratedComments: false,
        scrubDescriptions: false,
      })
    )
    expect(off).not.toContain('Market descriptions have')
    expect(off).toContain('are delivered with their text')
  })
})

// Shapes from a second independent review.
describe('pairs and @handles, review round 2', () => {
  const scanArgs = (ctx: RedactContext): ScanArgs => ({
    deliveredContractIds: new Set(['c1']),
    allUserIds: ctx.knownUserIds,
    forbiddenStrings: [],
    names: ctx.names,
    ps,
    failOnBareNames: true,
    scrubDescriptions: true,
  })
  const joined = (row: Row) =>
    row.data.description.content[0].content.map((n: any) => n.text).join('')
  const para = (...texts: string[]) => ({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: texts.map((text, i) =>
          i === 0
            ? { type: 'text', text, marks: [{ type: 'bold' }] }
            : { type: 'text', text }
        ),
      },
    ],
  })

  test('a pair split by formatting', () => {
    const ctx = makeCtx({ scrubDescriptions: true })
    const raw = () =>
      contractRow({
        description: para('Wrenna Quorvel', ' (@Quorvel_17) wins'),
      })
    expect(scanBatch('contracts', [raw()], scanArgs(ctx)).namePairLeaks).toBe(1)
    const out = REDACTORS.contracts(raw(), ctx) as Row
    const q = P(QUORVEL)
    expect(joined(out)).toBe(`${q} (@${q}) wins`)
    expect(scanBatch('contracts', [out], scanArgs(ctx)).namePairLeaks).toBe(0)
  })

  test('an edit at the very end of a run lands at the end', () => {
    const ctx = makeCtx({ scrubDescriptions: true })
    const out = REDACTORS.contracts(
      contractRow({ description: para('see ', 'Wrenna Quorvel @Quorvel_17') }),
      ctx
    ) as Row
    const q = P(QUORVEL)
    expect(joined(out)).toBe(`see ${q} @${q}`)
  })

  test.each([
    ['"Wrenna Quorvel" (@Quorvel_17)', (q: string) => `"${q}" (@${q})`],
    ['Wrenna Quorvel ( @Quorvel_17 )', (q: string) => `${q} ( @${q} )`],
    ['**Wrenna Quorvel** — @Quorvel_17', (q: string) => `**${q}** — @${q}`],
    ['by Wrenna Quorvel @Quorvel_17', (q: string) => `by ${q} @${q}`],
  ])('pair form %s', (text, expected) => {
    const idCtx = identityContext(makeCtx())
    if (!idCtx) throw new Error('no names')
    expect(rewriteNameHandlePairs(text, idCtx)).toBe(expected(P(QUORVEL)))
  })

  test('shared, one-letter and long display names still pair', () => {
    const names = NameIndex.fromRecords([
      ...RECORDS,
      { id: ZEPHYR, username: 'zephyrin', name: 'Wrenna Quorvel' }, // same name, other user
      { id: ZANDER, username: 'ZanderMode', name: 'Q' },
      {
        id: DUP2,
        username: 'dup_7q_b',
        name: 'A Wren And A Quorvel In The Glen',
      },
    ])
    names.setRareThreshold(20)
    const idCtx = identityContext(makeCtx({ names }))
    if (!idCtx) throw new Error('no names')
    expect(rewriteNameHandlePairs('Wrenna Quorvel (@Quorvel_17)', idCtx)).toBe(
      `${P(QUORVEL)} (@${P(QUORVEL)})`
    )
    expect(rewriteNameHandlePairs('Q (@ZanderMode)', idCtx)).toBe(
      `${P(ZANDER)} (@${P(ZANDER)})`
    )
    expect(
      rewriteNameHandlePairs(
        'A Wren And A Quorvel In The Glen (@dup_7q_b)',
        idCtx
      )
    ).toBe(`${P(DUP2)} (@${P(DUP2)})`)
  })

  test("'.@handle' counts; a handle inside a URL is the URL rules' business", () => {
    const ctx = makeCtx({ scrubDescriptions: true })
    const v = P(VELMORIN)
    const out = REDACTORS.contracts(
      contractRow({
        description: doc('.@velmorin said so: https://example.org/@velmorin'),
      }),
      ctx
    ) as Row
    expect(out.data.description.content[0].content[0].text).toBe(
      `.@${v} said so: https://example.org/@velmorin`
    )
    expect(scanBatch('contracts', [out], scanArgs(ctx)).atHandleLeaks).toBe(0)
  })

  test('@handles in a link preview title are rewritten and gated', () => {
    const ctx = makeCtx({ scrubDescriptions: true })
    const description = () => ({
      type: 'doc',
      content: [
        {
          type: 'linkPreview',
          attrs: { url: 'https://example.org', title: 'source @velmorin' },
        },
      ],
    })
    const raw = contractRow({ description: description() })
    expect(scanBatch('contracts', [raw], scanArgs(ctx)).atHandleLeaks).toBe(1)
    const out = REDACTORS.contracts(
      contractRow({ description: description() }),
      ctx
    ) as Row
    expect(out.data.description.content[0].attrs.title).toBe(
      `source @${P(VELMORIN)}`
    )
    expect(scanBatch('contracts', [out], scanArgs(ctx)).atHandleLeaks).toBe(0)
  })
})
