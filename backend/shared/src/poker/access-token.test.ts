import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { ModuleKind, transpileModule } from 'typescript'

it('retains private access across SPA navigation when browser storage is blocked', () => {
  const blocked = {
    getItem: () => {
      throw new Error('Storage blocked')
    },
    setItem: () => {
      throw new Error('Storage blocked')
    },
  }
  const window = {
    localStorage: blocked,
    sessionStorage: blocked,
    location: { pathname: '/poker/table', hash: '' },
    history: { state: {}, replaceState: jest.fn() },
  }
  const exports = {} as {
    savePokerToken: (id: string, token: string) => boolean
    restorePokerToken: (id: string) => string | undefined
  }
  runInNewContext(
    transpileModule(
      readFileSync(
        resolve(__dirname, '../../../../web/components/poker/access-token.ts'),
        'utf8'
      ),
      { compilerOptions: { module: ModuleKind.CommonJS } }
    ).outputText,
    { exports, window, URLSearchParams }
  )
  const token = 'a'.repeat(64)
  expect(exports.savePokerToken('table', token)).toBe(false)
  expect(window.location.hash).toBe('')
  expect(exports.restorePokerToken('table')).toBe(token)
  expect(exports.restorePokerToken('another-table')).toBeUndefined()
  // An explicit invitation takes precedence and is stripped even without storage.
  const replacement = 'b'.repeat(64)
  window.location.hash = `#invite=${replacement}`
  expect(exports.restorePokerToken('table')).toBe(replacement)
  expect(window.history.replaceState).toHaveBeenCalledWith(
    {},
    '',
    '/poker/table'
  )
})
