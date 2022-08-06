import { PROJECT_ID } from 'common/envs/constants'
import { setCookie, getCookies } from '../util/cookie'
import { IncomingMessage, ServerResponse } from 'http'

const ONE_HOUR_SECS = 60 * 60
const TEN_YEARS_SECS = 60 * 60 * 24 * 365 * 10
const TOKEN_KINDS = ['refresh', 'id', 'custom'] as const
const TOKEN_AGES = {
  id: ONE_HOUR_SECS,
  refresh: ONE_HOUR_SECS,
  custom: TEN_YEARS_SECS,
} as const
export type TokenKind = typeof TOKEN_KINDS[number]

const getAuthCookieName = (kind: TokenKind) => {
  const suffix = `${PROJECT_ID}_${kind}`.toUpperCase().replace(/-/g, '_')
  return `FIREBASE_TOKEN_${suffix}`
}

const COOKIE_NAMES = Object.fromEntries(
  TOKEN_KINDS.map((k) => [k, getAuthCookieName(k)])
) as Record<TokenKind, string>

const getCookieDataIsomorphic = (req?: IncomingMessage) => {
  if (req != null) {
    return req.headers.cookie ?? ''
  } else if (document != null) {
    return document.cookie
  } else {
    throw new Error(
      'Neither request nor document is available; no way to get cookies.'
    )
  }
}

const setCookieDataIsomorphic = (cookies: string[], res?: ServerResponse) => {
  if (res != null) {
    res.setHeader('Set-Cookie', cookies)
  } else if (document != null) {
    for (const ck of cookies) {
      document.cookie = ck
    }
  } else {
    throw new Error(
      'Neither response nor document is available; no way to set cookies.'
    )
  }
}

export const getTokensFromCookies = (req?: IncomingMessage) => {
  const cookies = getCookies(getCookieDataIsomorphic(req))
  return Object.fromEntries(
    TOKEN_KINDS.map((k) => [k, cookies[COOKIE_NAMES[k]]])
  ) as Partial<Record<TokenKind, string>>
}

export const setTokenCookies = (
  cookies: Partial<Record<TokenKind, string | undefined>>,
  res?: ServerResponse
) => {
  const data = TOKEN_KINDS.filter((k) => k in cookies).map((k) => {
    const maxAge = cookies[k] ? TOKEN_AGES[k as TokenKind] : 0
    return setCookie(COOKIE_NAMES[k], cookies[k] ?? '', [
      ['path', '/'],
      ['max-age', maxAge.toString()],
      ['samesite', 'lax'],
      ['secure'],
    ])
  })
  setCookieDataIsomorphic(data, res)
}

export const deleteTokenCookies = (res?: ServerResponse) =>
  setTokenCookies({ id: undefined, refresh: undefined, custom: undefined }, res)
