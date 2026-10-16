/* eslint-disable @typescript-eslint/no-require-imports, react/prop-types -- Node test with inert layout wrappers, not production React components. */
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { test } = require('node:test')
const { runInNewContext } = require('node:vm')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { JsxEmit, ModuleKind, transpileModule } = require('typescript')

// Render the real section and row components with inert layout wrappers.
// No browser, API request, authentication, or live classification is needed.
const source = readFileSync(
  resolve(__dirname, '../pages/admin/model-classifications.tsx'),
  'utf8'
)
const sectionModule = { exports: {} }
const component = (tag) => (props) =>
  React.createElement(tag, { disabled: props.disabled }, props.children)
runInNewContext(
  transpileModule(
    `${source}\nexport { LabClassificationSection as ReviewSection }`,
    {
      compilerOptions: {
        module: ModuleKind.CommonJS,
        jsx: JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }
  ).outputText,
  {
    exports: sectionModule.exports,
    require: (id) => {
      if (id.startsWith('web/'))
        return new Proxy(
          {},
          { get: (_, name) => component(name === 'Button' ? 'button' : 'div') }
        )
      return require(id)
    },
  }
)

const renderQueue = (provisional) =>
  renderToStaticMarkup(
    React.createElement(sectionModule.exports.ReviewSection, {
      data: {
        pending: [],
        decided: [],
        provisional,
        seedVersion: 'test',
        recheckIntervalMs: 7 * 24 * 60 * 60 * 1000,
      },
      onDone() {},
    })
  )

test('watched lab rows retain a way to firm their default verdict', () => {
  const html = renderQueue([
    {
      subjectType: 'model',
      subjectSlug: 'stealth/new-preview',
      evidence: 'Provisional default',
      sourceUrl: 'https://openrouter.ai/stealth/new-preview',
      exampleModels: [],
      exampleNames: [],
      classifiedAt: Date.now(),
      nextCheckAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      contradicted: false,
      agentSearches: [],
    },
  ])
  assert.match(html, /<button[^>]*>firm it up<\/button>/)
  assert.match(html, /Provisional default/)
  assert.doesNotMatch(html, /Evidence summary/)
})
