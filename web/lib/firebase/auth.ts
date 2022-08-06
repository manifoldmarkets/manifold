import { PROJECT_ID } from 'common/envs/constants'
import { setCookie, getCookies } from '../util/cookie'
import { IncomingMessage, ServerResponse } from 'http'

const TOKEN_KINDS = ['refresh', 'id', 'custom'] as const
type TokenKind = typeof TOKEN_KINDS[number]

const getAuthCookieName = (kind: TokenKind) => {
  const suffix = `${PROJECT_ID}_${kind}`.toUpperCase().replace(/-/g, '_')
  return `FIREBASE_TOKEN_${suffix}`
}

const ID_COOKIE_NAME = getAuthCookieName('id')
const REFRESH_COOKIE_NAME = getAuthCookieName('refresh')
const CUSTOM_COOKIE_NAME = getAuthCookieName('custom')
const ONE_HOUR_SECS = 60 * 60
const TEN_YEARS_SECS = 60 * 60 * 24 * 365 * 10

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

export const getAuthCookies = (req?: IncomingMessage) => {
  const cookies = getCookies(getCookieDataIsomorphic(req))
  return {
    idToken: cookies[ID_COOKIE_NAME] as string | undefined,
    refreshToken: cookies[REFRESH_COOKIE_NAME] as string | undefined,
    customToken: cookies[CUSTOM_COOKIE_NAME] as string | undefined,
  }
}

export const setAuthCookies = (
  idToken?: string,
  refreshToken?: string,
  customToken?: string,
  res?: ServerResponse
) => {
  const idMaxAge = idToken != null ? ONE_HOUR_SECS : 0
  const idCookie = setCookie(ID_COOKIE_NAME, idToken ?? '', [
    ['path', '/'],
    ['max-age', idMaxAge.toString()],
    ['samesite', 'lax'],
    ['secure'],
  ])
  const customMaxAge = customToken != null ? ONE_HOUR_SECS : 0
  const customCookie = setCookie(CUSTOM_COOKIE_NAME, customToken ?? '', [
    ['path', '/'],
    ['max-age', customMaxAge.toString()],
    ['samesite', 'lax'],
    ['secure'],
  ])
  const refreshMaxAge = refreshToken != null ? TEN_YEARS_SECS : 0
  const refreshCookie = setCookie(REFRESH_COOKIE_NAME, refreshToken ?? '', [
    ['path', '/'],
    ['max-age', refreshMaxAge.toString()],
    ['samesite', 'lax'],
    ['secure'],
  ])
  setCookieDataIsomorphic([idCookie, refreshCookie, customCookie], res)
}

export const deleteAuthCookies = (res?: ServerResponse) =>
  setAuthCookies(undefined, undefined, undefined, res)
