type CookieOptions = string[][]

const encodeCookie = (name: string, val: string) => {
  return `${name}=${encodeURIComponent(val)}`
}

const decodeCookie = (cookie: string) => {
  const parts = cookie.trim().split('=')
  if (parts.length != 2) {
    throw new Error(`Invalid cookie contents: ${cookie}`)
  }
  return [parts[0], decodeURIComponent(parts[1])] as const
}

export const setCookie = (name: string, val: string, opts?: CookieOptions) => {
  const parts = [encodeCookie(name, val)]
  if (opts != null) {
    parts.push(...opts.map((opt) => opt.join('=')))
  }
  return parts.join('; ')
}

// Note that this intentionally ignores the case where multiple cookies have
// the same name but different paths. Hopefully we never need to think about it.
export const getCookies = (cookies: string) =>
  Object.fromEntries(cookies.split(';').map(decodeCookie))
