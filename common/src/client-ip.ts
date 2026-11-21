type HeaderValue = string | string[] | undefined
type HeaderMap = Record<string, HeaderValue>

const CLIENT_IP_HEADER_NAMES = [
  'cf-connecting-ip',
  'true-client-ip',
  'fastly-client-ip',
  'forwarded',
  'x-real-ip',
  'x-client-ip',
  'x-forwarded-for',
  'x-vercel-forwarded-for',
] as const

function normalizeHeaderValue(value: HeaderValue) {
  if (Array.isArray(value)) return value.join(',')
  return value ?? ''
}

function stripIpFormatting(value: string) {
  let result = value.trim()

  if (!result) return ''

  if (result.toLowerCase() === 'unknown') return ''

  const forwardedPrefix = 'for='
  if (result.toLowerCase().startsWith(forwardedPrefix)) {
    result = result.slice(forwardedPrefix.length)
  }

  if (result.includes(';')) {
    result = result.split(';')[0].trim()
  }

  result = result.replace(/^"(.*)"$/, '$1')

  if (result.startsWith('[') && result.includes(']')) {
    return result.slice(1, result.indexOf(']'))
  }

  const ipv4WithPort = result.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/)
  if (ipv4WithPort) {
    return ipv4WithPort[1]
  }

  if (result.startsWith('::ffff:')) {
    return result.slice('::ffff:'.length)
  }

  return result
}

function isValidIpv4(ip: string) {
  const parts = ip.split('.')
  if (parts.length !== 4) return false

  return parts.every((part) => {
    if (!/^\d+$/.test(part)) return false
    const value = Number(part)
    return value >= 0 && value <= 255
  })
}

function isValidIpv6(ip: string) {
  if (!ip.includes(':')) return false

  const doubleColonCount = ip.split('::').length - 1
  if (doubleColonCount > 1) return false

  const [left, right = ''] = ip.split('::')

  const parseSection = (section: string) => {
    if (!section) return [] as number[]

    const groups = section.split(':')
    const units: number[] = []

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i]
      if (!group) return null

      if (group.includes('.')) {
        if (i !== groups.length - 1 || !isValidIpv4(group)) return null
        units.push(2)
      } else {
        if (!/^[0-9a-f]{1,4}$/i.test(group)) return null
        units.push(1)
      }
    }

    return units
  }

  const leftUnits = parseSection(left)
  const rightUnits = parseSection(right)
  if (!leftUnits || !rightUnits) return false

  const totalUnits =
    leftUnits.reduce((sum, unit) => sum + unit, 0) +
    rightUnits.reduce((sum, unit) => sum + unit, 0)

  if (doubleColonCount === 1) {
    return totalUnits < 8
  }

  return totalUnits === 8
}

function isPrivateIpv4(ip: string) {
  const [a, b] = ip.split('.').map(Number)

  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127)
  )
}

function isPrivateIpv6(ip: string) {
  const normalized = ip.toLowerCase()
  return (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
  )
}

export function isPublicIp(ip: string) {
  if (isValidIpv4(ip)) return !isPrivateIpv4(ip)
  if (isValidIpv6(ip)) return !isPrivateIpv6(ip)
  return false
}

export function getClientIpCandidates(
  headers: HeaderMap,
  fallbackIps: Array<string | undefined> = []
) {
  const candidates: string[] = []

  for (const headerName of CLIENT_IP_HEADER_NAMES) {
    const rawValue = normalizeHeaderValue(headers[headerName])
    if (!rawValue) continue

    for (const part of rawValue.split(',')) {
      const ip = stripIpFormatting(part)
      if (ip && (isValidIpv4(ip) || isValidIpv6(ip))) {
        candidates.push(ip)
      }
    }
  }

  for (const fallbackIp of fallbackIps) {
    const ip = stripIpFormatting(fallbackIp ?? '')
    if (ip && (isValidIpv4(ip) || isValidIpv6(ip))) {
      candidates.push(ip)
    }
  }

  return Array.from(new Set(candidates))
}

export function getBestClientIp(
  headers: HeaderMap,
  fallbackIps: Array<string | undefined> = []
) {
  const candidates = getClientIpCandidates(headers, fallbackIps)
  return candidates.find(isPublicIp) ?? candidates[0] ?? ''
}
