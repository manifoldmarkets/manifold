import { DOMAIN } from 'common/envs/constants'

// Subdomain labels that are never treated as a private-instance name, even
// if someone manages to provision one (create-instance.ts also rejects
// these at creation time — this is belt-and-suspenders for routing).
const RESERVED_SUBDOMAINS = new Set(['www', 'api', 'dev', 'localhost'])

// Extracts a private-instance subdomain (e.g. "myteam" from
// myteam.manifold.markets) from a request Host header, or null if this is
// the main site. Also recognizes myteam.localhost[:port] for local dev,
// independent of what DOMAIN happens to be set to.
export function getInstanceSubdomainFromHostname(
  hostname: string
): string | null {
  const host = hostname.split(':')[0].toLowerCase()
  const base = DOMAIN.toLowerCase()

  let label: string | null = null
  if (host.endsWith(`.${base}`)) {
    label = host.slice(0, -(base.length + 1))
  } else if (host.endsWith('.localhost')) {
    label = host.slice(0, -'.localhost'.length)
  } else {
    return null
  }

  if (!label || label.includes('.') || RESERVED_SUBDOMAINS.has(label)) {
    return null
  }
  return label
}
