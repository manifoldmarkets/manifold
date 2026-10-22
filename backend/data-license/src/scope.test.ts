import { readdirSync, statSync } from 'fs'
import { join } from 'path'
import { RESERVED_PATHS } from 'common/envs/constants'
import { COLUMN_TYPES, MANIFOLD_PAGE_ROUTES } from './scope'

const WEB = join(__dirname, '../../../web')
const ROUTES = new Set([...RESERVED_PATHS, ...MANIFOLD_PAGE_ROUTES])

// identity.ts treats the first segment of a manifold.markets link as a
// username unless it is a route. A new page or public folder missing from the
// list would have its links rewritten, so the list must cover the tree.
describe('manifold.markets routes', () => {
  test('every top-level page is a known route', () => {
    const pages = readdirSync(join(WEB, 'pages'))
      .map((f) => f.replace(/\.(tsx|ts|js)$/, ''))
      .filter(
        (f) => !['_app', '_document', '404', 'index', '[username]'].includes(f)
      )
    expect(pages.filter((p) => !ROUTES.has(p))).toEqual([])
  })

  test('every web/public folder is a known route', () => {
    const dir = join(WEB, 'public')
    const folders = readdirSync(dir).filter(
      // a name with a dot is never taken for a username, folder or not
      (f) => statSync(join(dir, f)).isDirectory() && !f.includes('.')
    )
    expect(folders.filter((f) => !ROUTES.has(f))).toEqual([])
  })
})

test('typed columns added on main since the export was written', () => {
  expect(COLUMN_TYPES.p).toBe('DOUBLE')
  expect(COLUMN_TYPES.cancel_time_reliable).toBe('BOOLEAN')
})
