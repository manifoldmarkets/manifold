import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { ModuleKind, transpileModule } from 'typescript'

const source = transpileModule(
  readFileSync(
    resolve(__dirname, '../../../../web/components/poker/access-token.ts'),
    'utf8'
  ),
  { compilerOptions: { module: ModuleKind.CommonJS } }
).outputText
const blocked = {
  getItem: () => {
    throw new Error('Storage blocked')
  },
  setItem: () => {
    throw new Error('Storage blocked')
  },
}
function storage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
}
function browser(
  localStorage = blocked as ReturnType<typeof storage>,
  sessionStorage = blocked as ReturnType<typeof storage>
) {
  const location = { pathname: '/poker/table', hash: '' }
  return {
    localStorage,
    sessionStorage,
    location,
    history: {
      state: {},
      replaceState: jest.fn((_state, _title, url: string) => {
        location.hash = new URL(url, 'https://manifold.markets').hash
      }),
    },
  }
}
function load(window: ReturnType<typeof browser>) {
  const exports = {} as {
    savePokerToken: (id: string, token: string) => boolean
    restorePokerToken: (id: string) => string | undefined
  }
  // A fresh module simulates a reload, discarding the in-memory token cache.
  runInNewContext(source, { exports, window, URLSearchParams })
  return exports
}

it('retains private access across SPA navigation and reloads when storage is blocked', () => {
  const window = browser()
  const api = load(window)
  const token = 'a'.repeat(64)
  expect(api.savePokerToken('table', token)).toBe(false)
  expect(window.location.hash).toBe('')
  expect(api.restorePokerToken('table')).toBe(token)
  expect(api.restorePokerToken('another-table')).toBeUndefined()
  const replacement = 'b'.repeat(64)
  window.location.hash = `#invite=${replacement}`
  expect(api.restorePokerToken('table')).toBe(replacement)
  expect(window.history.replaceState).not.toHaveBeenCalled()
  expect(window.location.hash).toBe(`#invite=${replacement}`)
  expect(load(window).restorePokerToken('table')).toBe(replacement)
})

it.each(['localStorage', 'sessionStorage'] as const)(
  'clears the fragment only after %s saves a reload-safe token',
  (available) => {
    const window = browser()
    window[available] = storage()
    const token = 'c'.repeat(64)
    window.location.hash = `#invite=${token}`
    expect(load(window).restorePokerToken('table')).toBe(token)
    expect(window.history.replaceState).toHaveBeenCalledWith(
      {},
      '',
      '/poker/table'
    )
    expect(window.location.hash).toBe('')
    expect(load(window).restorePokerToken('table')).toBe(token)
  }
)
