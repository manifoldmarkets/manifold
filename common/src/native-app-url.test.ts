import {
  isLocalHostname,
  isSameOrigin,
  originOf,
  parseHttpOrigin,
  parseSwitchableAppUrl,
} from './native-app-url'

describe('parseHttpOrigin', () => {
  it('canonicalizes scheme and host case', () => {
    // React Native's URL polyfill does not lowercase, so an uppercase host would
    // never match the lowercase origin a document reports for itself.
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
    expect(originOf('https://manifold.markets/home?nativePlatform=android')).toBe(
      'https://manifold.markets'
    )
    expect(originOf('https://manifold.markets/#/deep')).toBe(
      'https://manifold.markets'
    )
  })

  it('rejects userinfo, which RN URL.origin would keep', () => {
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

  it('rejects malformed input rather than coercing it', () => {
    // RN's single-argument URL constructor never throws, so these all "parse"
    // there; a try/catch is not a filter.
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
    expect(originOf('https://mänifold.markets/')).toBeNull()
    expect(originOf('https://манифолд.рф/')).toBeNull()
    expect(originOf('https://xn--mnifold-5wa.markets/')).toBe(
      'https://xn--mnifold-5wa.markets'
    )
  })

  it('rejects non-strings', () => {
    for (const raw of [null, undefined, 42, {}, [], { toString: () => 'x' }])
      expect(originOf(raw)).toBeNull()
  })

  it('handles bracketed IPv6', () => {
    expect(originOf('http://[::1]:3000/')).toBe('http://[::1]:3000')
    expect(originOf('http://[::1/')).toBeNull()
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
      isSameOrigin('https://manifold.markets/home?x=1', 'https://manifold.markets/')
    ).toBe(true)
    expect(isSameOrigin('https://MANIFOLD.markets/', 'https://manifold.markets/')).toBe(
      true
    )
  })

  it('separates scheme, host and port', () => {
    expect(isSameOrigin('http://manifold.markets/', 'https://manifold.markets/')).toBe(
      false
    )
    expect(
      isSameOrigin('https://www.manifold.markets/', 'https://manifold.markets/')
    ).toBe(false)
    expect(
      isSameOrigin('https://manifold.markets.evil.com/', 'https://manifold.markets/')
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
    ])
      expect(isLocalHostname(host)).toBe(false)
  })
})

describe('parseSwitchableAppUrl', () => {
  it('accepts the deploy previews and LAN dev servers the workflow needs', () => {
    expect(parseSwitchableAppUrl('https://prod-git-abc-manifold.vercel.app')).toEqual(
      {
        origin: 'https://prod-git-abc-manifold.vercel.app',
        base: 'https://prod-git-abc-manifold.vercel.app/',
        href: 'https://prod-git-abc-manifold.vercel.app/',
      }
    )
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
      'not a url',
      '',
      null,
      undefined,
      42,
    ])
      expect(parseSwitchableAppUrl(raw)).toBeNull()
  })
})

// Transcribed VERBATIM from react-native@0.81.4
// Libraries/Blob/URL.js (the module polyfillGlobal installs as the global URL in
// setUpXHR.js). Not the live module — common's jest cannot load a Flow file — so
// this pins the behaviour that motivated parsing urls by hand. If a React Native
// upgrade makes these fail, the global URL may have become spec-compliant and
// this module could be reconsidered.
describe('react-native 0.81 URL semantics this module exists to avoid', () => {
  class RnUrl {
    _url: string
    constructor(url: string) {
      this._url = url
      if (this._url.includes('#')) {
        const split = this._url.split('#')
        const beforeHash = split[0]
        const website = beforeHash.split('://')[1]
        if (!website.includes('/')) this._url = split.join('/#')
      }
      if (
        !this._url.endsWith('/') &&
        !(this._url.includes('?') || this._url.includes('#'))
      )
        this._url += '/'
    }
    get origin(): string {
      const matches = this._url.match(/^(https?:\/\/[^/]+)/)
      return matches ? matches[1] : ''
    }
    get hostname(): string {
      const m = this._url.match(/^https?:\/\/(?:[^@]+@)?([^:/?#]+)/)
      return m ? m[1] : ''
    }
  }

  it('never throws on garbage, so try/catch is not a filter', () => {
    expect(() => new RnUrl('not a url')).not.toThrow()
    expect(() => new RnUrl('javascript:alert(1)')).not.toThrow()
    expect(originOf('not a url')).toBeNull()
  })

  it('keeps userinfo in origin while hostname strips it', () => {
    const url = new RnUrl('https://manifold.markets@evil.com/')
    expect(url.origin).toBe('https://manifold.markets@evil.com')
    expect(url.hostname).toBe('evil.com')
    expect(originOf('https://manifold.markets@evil.com/')).toBeNull()
  })

  it('does not lowercase the host', () => {
    expect(new RnUrl('https://PREVIEW.VERCEL.APP/').origin).toBe(
      'https://PREVIEW.VERCEL.APP'
    )
    expect(originOf('https://PREVIEW.VERCEL.APP/')).toBe(
      'https://preview.vercel.app'
    )
  })
})
