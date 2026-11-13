const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const root = path.resolve(__dirname, '../../..')
function load(file, dependencies, globals = {}) {
  const exports = {}
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
      fileName: file,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    {
      exports,
      ...globals,
      require(id) {
        if (Object.prototype.hasOwnProperty.call(dependencies, id))
          return dependencies[id]
        throw new Error(`Unexpected dependency: ${id}`)
      },
    }
  )
  return exports
}

module.exports = { load }
