import {
  isLocalHostname,
  isSameOrigin,
  originOf,
  parseHttpOrigin,
  parseSwitchableAppUrl,
} from './native-app-url'

// Every url this module accepts, so the browser-oracle invariant below can be
// asserted over all of them in one place. Add here when adding an accept case.
const ACCEPTED = [
  'https://manifold.markets/',
  'https://dev.manifold.markets/',
  'https://PREVIEW.VERCEL.APP',
  'HTTPS://Manifold.Markets/Home',
  'https://manifold.markets:443/x',
  'https://manifold.markets:8443/',
  'https://manifold.markets/home?nativePlatform=android',
  'https://manifold.markets/#/deep',
  'https://xn--mnifold-5wa.markets/',
  'https://prod-git-abc-manifold.vercel.app',
  'http://localhost:3000/',
  'HTTP://LOCALHOST:3000',
  'http://localhost:80/',
  'http://127.0.0.1:3001',
  'http://192.168.1.229:3000/',
  'http://10.0.0.5:3000',
  'http://172.16.4.4:3000',
  'http://[::1]:3000/',
  'https://1.2.3.4/',
]

describe('browser-origin invariant', () => {
  // The whole point of the module: an accepted origin must be exactly what a
  // browser reports for that document, or the credential hand-off compares two
  // different strings forever. Node's WHATWG URL stands in for the browser here
  // — it is NOT a valid oracle for the app's runtime parser
  // (whatwg-url-without-unicode preserves host case), but it is the right oracle
  // for what a WebView document's location.origin will say.
  it.each(ACCEPTED)('%s round-trips through a real URL parser', (raw) => {
    const parsed = parseHttpOrigin(raw)
    expect(parsed).not.toBeNull()
    const href = parsed!.origin + (parsed!.rest || '/')
    expect(new URL(href).origin).toBe(parsed!.origin)
  })

  it.each(ACCEPTED)('%s produces a switchable base a browser agrees with', (raw) => {
    const parsed = parseSwitchableAppUrl(raw)
    if (!parsed) return // http on a public host is rejected by design
    expect(new URL(parsed.base).origin).toBe(parsed.origin)
    expect(new URL(parsed.href).origin).toBe(parsed.origin)
  })
})

describe('parseHttpOrigin', () => {
  it('canonicalizes scheme and host case', () => {
    // The app's runtime URL does not lowercase, so an uppercase host would never
    // match the lowercase origin a document reports for itself.
    expect(originOf('https://PREVIEW.VERCEL.APP')).toBe(
      'https://preview.vercel.app'
    )
    expect(originOf('HTTPS://Manifold.Markets/Home')).toBe(
      'https://manifold.markets'
    )
    expect(originOf('HTTP://LOCALHOST:3000')).toBe('http://localhost:3000')
  })

  it('drops the default port, keeps a non-default one', () => {
    expect(originOf('https://manifold.markets:443/x')).toBe(
      'https://manifold.markets'
    )
    expect(originOf('http://localhost:80/')).toBe('http://localhost')
    expect(originOf('http://localhost:3000/')).toBe('http://localhost:3000')
  })

  it('ignores path, query and fragment', () => {
    expect(
      originOf('https://manifold.markets/home?nativePlatform=android')
    ).toBe('https://manifold.markets')
    expect(originOf('https://manifold.markets/#/deep')).toBe(
      'https://manifold.markets'
    )
  })

  it('rejects userinfo', () => {
    expect(originOf('https://manifold.markets@evil.com/')).toBeNull()
    expect(originOf('https://user:pass@evil.com/')).toBeNull()
  })

  it('rejects non-http(s) schemes', () => {
    for (const raw of [
      'javascript:alert(1)',
      'data:text/html,<script>x</script>',
      'file:///sdcard/evil.html',
      'about:blank',
      'blob:https://evil.com/1234',
      'ftp://manifold.markets/',
      'manifold://home',
    ])
      expect(originOf(raw)).toBeNull()
  })

  it('rejects malformed input', () => {
    for (const raw of [
      'not a url',
      '',
      '   ',
      '//manifold.markets/',
      'https://',
      'https:///path',
      'https://manifold.markets:0/',
      'https://manifold.markets:99999/',
      'https://manifold.markets:8o80/',
      'https://manifold.markets:+80/',
      'https://mani fold.markets/',
      'https://man\tifold.markets/',
    ])
      expect(originOf(raw)).toBeNull()
  })

  it('rejects non-ASCII hosts but accepts their punycode form', () => {
    // The runtime URL skips IDNA entirely, so a unicode host would be stored
    // verbatim while the browser reports the punycoded origin.
    expect(originOf('https://mänifold.markets/')).toBeNull()
    expect(originOf('https://манифолд.рф/')).toBeNull()
    expect(originOf('https://xn--mnifold-5wa.markets/')).toBe(
      'https://xn--mnifold-5wa.markets'
    )
  })

  it('rejects non-canonical IPv4, which a browser would rewrite', () => {
    // Each of these parses in a browser but serializes to something else, so
    // storing our reading of it would strand the hand-off. Asserted against the
    // oracle so the comment cannot rot.
    for (const [raw, browserOrigin] of [
      ['https://127.1/', 'https://127.0.0.1'],
      ['https://010.000.000.001/', 'https://8.0.0.1'],
      ['https://2130706433/', 'https://127.0.0.1'],
      ['https://0x7f.0.0.1/', 'https://127.0.0.1'],
    ]) {
      expect(new URL(raw).origin).toBe(browserOrigin)
      expect(originOf(raw)).toBeNull()
    }
  })

  it('accepts only already-canonical IPv6 loopback', () => {
    expect(originOf('http://[::1]:3000/')).toBe('http://[::1]:3000')
    // A browser compresses this to [::1]; we reject rather than reimplement
    // RFC 5952.
    expect(new URL('http://[0:0:0:0:0:0:0:1]:3000/').origin).toBe(
      'http://[::1]:3000'
    )
    expect(originOf('http://[0:0:0:0:0:0:0:1]:3000/')).toBeNull()
    // Malformed: a browser throws, and so must we — the old parser accepted
    // these and threw later, after trust had already been cleared.
    for (const raw of ['http://[:::]/', 'http://[1::2::3]/', 'http://[::1/']) {
      expect(() => new URL(raw)).toThrow()
      expect(originOf(raw)).toBeNull()
    }
    // Any other IPv6 is refused, canonical or not.
    expect(originOf('http://[2001:db8::1]/')).toBeNull()
  })

  it('rejects non-strings', () => {
    for (const raw of [null, undefined, 42, {}, [], { toString: () => 'x' }])
      expect(originOf(raw)).toBeNull()
  })

  it('exposes the remainder after the authority', () => {
    expect(parseHttpOrigin('https://x.dev/foo/bar?q=1#h')?.rest).toBe(
      '/foo/bar?q=1#h'
    )
    expect(parseHttpOrigin('https://x.dev')?.rest).toBe('')
  })
})

describe('isSameOrigin', () => {
  it('matches regardless of path or case', () => {
    expect(
      isSameOrigin(
        'https://manifold.markets/home?x=1',
        'https://manifold.markets/'
      )
    ).toBe(true)
    expect(
      isSameOrigin('https://MANIFOLD.markets/', 'https://manifold.markets/')
    ).toBe(true)
  })

  it('separates scheme, host and port', () => {
    expect(
      isSameOrigin('http://manifold.markets/', 'https://manifold.markets/')
    ).toBe(false)
    expect(
      isSameOrigin('https://www.manifold.markets/', 'https://manifold.markets/')
    ).toBe(false)
    expect(
      isSameOrigin(
        'https://manifold.markets.evil.com/',
        'https://manifold.markets/'
      )
    ).toBe(false)
    expect(
      isSameOrigin('https://manifold.markets:8443/', 'https://manifold.markets/')
    ).toBe(false)
  })

  it('never treats two unparseable urls as the same origin', () => {
    // The empty string is what the app holds while it distrusts the WebView.
    expect(isSameOrigin('', '')).toBe(false)
    expect(isSameOrigin('', 'https://manifold.markets/')).toBe(false)
    expect(isSameOrigin('null', 'null')).toBe(false)
    expect(isSameOrigin(undefined, undefined)).toBe(false)
  })
})

describe('isLocalHostname', () => {
  it('accepts loopback and RFC1918', () => {
    for (const host of [
      'localhost',
      '[::1]',
      '127.0.0.1',
      '127.1.2.3',
      '10.0.0.5',
      '192.168.1.229',
      '172.16.0.1',
      '172.31.255.255',
    ])
      expect(isLocalHostname(host)).toBe(true)
  })

  it('requires a complete numeric IPv4, not a prefix', () => {
    // The bug this replaced: /^10\./ matches a public hostname.
    for (const host of [
      '10.attacker.example',
      '192.168.attacker.example',
      '127.evil.com',
      '172.16.evil.com',
      '10.0.0.5.evil.com',
      'localhost.evil.com',
      'notlocalhost',
    ])
      expect(isLocalHostname(host)).toBe(false)
  })

  it('rejects neighbouring ranges and malformed octets', () => {
    for (const host of [
      '11.0.0.1',
      '172.15.0.1',
      '172.32.0.1',
      '192.169.0.1',
      '9.255.255.255',
      '10.0.0',
      '10.0.0.0.1',
      '10.0.0.256',
      '010.0.0.1',
      '10.0.0.01',
      '10.-1.0.1',
      '127.1',
    ])
      expect(isLocalHostname(host)).toBe(false)
  })
})

describe('parseSwitchableAppUrl', () => {
  it('accepts the deploy previews and LAN dev servers the workflow needs', () => {
    expect(
      parseSwitchableAppUrl('https://prod-git-abc-manifold.vercel.app')
    ).toEqual({
      origin: 'https://prod-git-abc-manifold.vercel.app',
      base: 'https://prod-git-abc-manifold.vercel.app/',
      href: 'https://prod-git-abc-manifold.vercel.app/',
    })
    expect(parseSwitchableAppUrl('http://192.168.1.229:3000/')?.base).toBe(
      'http://192.168.1.229:3000/'
    )
    expect(parseSwitchableAppUrl('http://localhost:3000')?.base).toBe(
      'http://localhost:3000/'
    )
  })

  it('keeps a typed path for the first navigation but never in the base', () => {
    // baseUri is concatenated with an endpoint, so a path in it yields '/foohome'.
    const parsed = parseSwitchableAppUrl('https://preview.vercel.app/foo')
    expect(parsed?.base).toBe('https://preview.vercel.app/')
    expect(parsed?.href).toBe('https://preview.vercel.app/foo')
    expect(parsed?.base + 'home').toBe('https://preview.vercel.app/home')
  })

  it('allows plain http only for loopback and RFC1918', () => {
    expect(parseSwitchableAppUrl('http://evil.com/')).toBeNull()
    expect(parseSwitchableAppUrl('http://10.attacker.example/')).toBeNull()
    expect(parseSwitchableAppUrl('http://192.168.attacker.example/')).toBeNull()
    expect(parseSwitchableAppUrl('http://172.32.0.1:3000/')).toBeNull()
    expect(parseSwitchableAppUrl('https://evil.com/')).not.toBeNull()
  })

  it('rejects everything parseHttpOrigin rejects', () => {
    for (const raw of [
      'javascript:alert(1)',
      'data:text/html,x',
      'file:///x',
      'about:blank',
      'blob:https://evil.com/1',
      'https://user@evil.com/',
      'https://127.1/',
      'http://[0:0:0:0:0:0:0:1]/',
      'not a url',
      '',
      null,
      undefined,
      42,
    ])
      expect(parseSwitchableAppUrl(raw)).toBeNull()
  })
})
