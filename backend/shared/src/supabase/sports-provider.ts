import { SPORTS_PROVIDER_PREFIXES } from 'common/sports-provider'

import { pgp } from './init'
import { renderSql, select } from './sql-builder'

/** Scalar expression for a contracts row aliased as c. Keep in sync with providerOf. */
export function sportsProviderSql() {
  const branches = SPORTS_PROVIDER_PREFIXES.map(([prefix, provider]) =>
    pgp.as.format("when starts_with(c.data->>'sportsEventId', $1) then $2", [
      prefix,
      provider,
    ])
  )
  const fallback = ['case', ...branches, "else 'legacy' end"].join(' ')
  return (
    '(' +
    renderSql(select("coalesce(c.data->>'sportsProvider', " + fallback + ')')) +
    ')'
  )
}
