import { createHash } from 'crypto'

type BdlValue = string | number | boolean
export type BdlParams = Readonly<Record<string, BdlValue | readonly BdlValue[]>>

const ENDPOINT =
  /^\/([a-z][a-z0-9]*|fifa\/worldcup)\/(v[1-9]\d*)\/([a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*)$/

function endpointParts(path: string) {
  const match = ENDPOINT.exec(path)
  if (!match || match[0] !== path || match[1] === 'account') {
    throw new Error('[sports-bdl-client] Invalid sports endpoint')
  }
  return {
    league: match[1].replace('/', '-'),
    endpointSlug:
      match[2] + '-' + match[3].replace(/-/g, '~').replace(/\//g, '-'),
  }
}

export function bdlUrl(path: string, params: BdlParams) {
  endpointParts(path)
  const url = new URL('https://api.balldontlie.io' + path)
  const names = new Set<string>()
  for (const [raw, value] of Object.entries(params)) {
    const name = raw.replace(/\[\]$/, '')
    if (!/^[a-zA-Z0-9_]+$/.test(name) || names.has(name))
      throw new Error('[sports-bdl-client] Invalid or duplicate parameter')
    names.add(name)
    const isList = Array.isArray(value) || raw.endsWith('[]')
    for (const v of Array.isArray(value) ? value : [value]) {
      if (
        typeof v !== 'string' &&
        typeof v !== 'boolean' &&
        !(typeof v === 'number' && Number.isFinite(v))
      )
        throw new Error('[sports-bdl-client] Invalid parameter value')
      url.searchParams.append(isList ? name + '[]' : name, String(v))
    }
  }
  url.searchParams.sort()
  return url
}

/** Shared by the private recorder and the local fixture reader. */
export function bdlRecordingPathParts(path: string, params: BdlParams = {}) {
  return {
    ...endpointParts(path),
    parameterHash: createHash('sha256')
      .update(bdlUrl(path, params).searchParams.toString())
      .digest('hex'),
  }
}
