const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const root = path.resolve(__dirname, '../../..')
const compiled = new Map()

function loadTypeScript(relativePath, globals = {}, dependencies = {}) {
  if (!compiled.has(relativePath)) {
    compiled.set(
      relativePath,
      ts.transpileModule(
        fs.readFileSync(path.join(root, relativePath), 'utf8'),
        {
          compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
          },
        }
      ).outputText
    )
  }
  const exports = {}
  const context = {
    exports,
    console: { warn() {}, log() {} },
    require: (name) => {
      if (!(name in dependencies))
        throw new Error(`Unexpected dependency: ${name}`)
      return dependencies[name]
    },
  }
  Object.defineProperties(context, Object.getOwnPropertyDescriptors(globals))
  vm.runInNewContext(compiled.get(relativePath), context)
  return exports
}

function createStorage(initial = {}) {
  const data = new Map(Object.entries(initial))
  const storage = {
    quota: Infinity,
    failures: new Set(),
    writes: 0,
    get length() {
      return data.size
    },
    key: (index) => [...data.keys()][index] ?? null,
    getItem(key) {
      check('getItem')
      return data.get(key) ?? null
    },
    setItem(key, value) {
      storage.writes++
      check('setItem')
      const next = new Map(data).set(key, String(value))
      if (size(next) > storage.quota)
        throw new DOMException('Storage is full', 'QuotaExceededError')
      data.set(key, String(value))
    },
    removeItem(key) {
      check('removeItem')
      data.delete(key)
    },
    clear() {
      check('clear')
      data.clear()
    },
    get bytes() {
      return size(data)
    },
  }
  function check(method) {
    if (storage.failures.has(method))
      throw new DOMException('Storage access denied', 'SecurityError')
  }
  function size(entries) {
    return [...entries].reduce(
      (sum, [key, value]) => sum + 2 * (key.length + value.length),
      0
    )
  }
  return storage
}

function loadStores(localStorage, sessionStorage = createStorage()) {
  return loadTypeScript('web/lib/util/local.ts', {
    localStorage,
    sessionStorage,
    window: {},
  })
}

module.exports = { loadTypeScript, createStorage, loadStores }
