import { PGlite } from '@electric-sql/pglite'

import { providerOf, SportsProvider } from 'common/sports-provider'

import { sportsProviderSql } from './sports-provider'

jest.mock('./init', () => ({ pgp: jest.requireActual('pg-promise')() }))

it('selects the same explicit and historical providers as providerOf in PostgreSQL', async () => {
  const inputs: {
    sportsProvider?: SportsProvider | null
    sportsEventId?: string | null
  }[] = [
    { sportsEventId: 'odds:event' },
    { sportsEventId: 'bdl-f1:1:2' },
    { sportsEventId: 'bdl-f1-title:2026:drivers' },
    { sportsEventId: 'bdl:nba:1' },
    { sportsEventId: 'fd-1' },
    { sportsEventId: 'fixture:nba:1' },
    { sportsEventId: 'other:1' },
    { sportsEventId: 'bdl-f1other:1' },
    { sportsEventId: 'ODDS:event' },
    { sportsEventId: null },
    {},
    { sportsProvider: 'odds', sportsEventId: 'bdl:nba:1' },
    { sportsProvider: 'fixture', sportsEventId: 'fd-1' },
    { sportsProvider: 'football-data' },
    { sportsProvider: null, sportsEventId: 'bdl:nba:1' },
  ]
  const db = new PGlite()
  try {
    const { rows } = await db.query<{ provider: string }>(
      'select ' +
        sportsProviderSql() +
        ' as provider from jsonb_array_elements($1::jsonb) with ordinality as c(data, position) order by position',
      [JSON.stringify(inputs)]
    )
    expect(rows.map((row) => row.provider)).toEqual(inputs.map(providerOf))
  } finally {
    await db.close()
  }
}, 30000)
