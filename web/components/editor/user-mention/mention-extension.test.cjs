// Run with: node --test web/components/editor/user-mention/mention-extension.test.cjs
// Exercise the real extension and TipTap input-rule lifecycle without a browser,
// suggestion requests, or mod notifications.
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { test } = require('node:test')
const { runInThisContext } = require('node:vm')
const ts = require('typescript')
const {
  getExtensionField,
  getSchema,
  inputRulesPlugin,
} = require('@tiptap/core')
const { EditorState, TextSelection } = require('prosemirror-state')

const source = readFileSync(join(__dirname, 'mention-extension.tsx'), 'utf8')
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.React,
    esModuleInterop: true,
  },
}).outputText
const loaded = { exports: {} }
runInThisContext(`(function(require, module, exports) { ${output}\n})`)(
  (name) => {
    if (name === 'common/envs/constants') return { MODS_USER_ID: 'test-mods' }
    if (name === './mention-suggestion')
      return { mentionSuggestion: {}, createMentionSuggestion: () => ({}) }
    if (name === './user-mention') return { UserMention: () => null }
    return require(name)
  },
  loaded,
  loaded.exports
)

function editorWith(text) {
  const mention = loaded.exports.DisplayMention
  const schema = getSchema([
    require('@tiptap/extension-document').default,
    require('@tiptap/extension-paragraph').default,
    require('@tiptap/extension-text').default,
    mention,
  ])
  const doc = schema.node('doc', null, [
    schema.node('paragraph', null, text ? schema.text(text) : null),
  ])
  const view = {
    composing: false,
    state: EditorState.create({ doc }),
    dispatch(tr) {
      this.state = this.state.apply(tr)
    },
  }
  const editor = { view, extensionManager: { commands: {} } }
  const rules = getExtensionField(mention, 'addInputRules', {
    type: schema.nodes.mention,
  })()
  const plugin = inputRulesPlugin({ editor, rules })
  view.state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, doc.content.size - 1),
    plugins: [plugin],
  })
  return {
    view,
    plugin,
    input(text) {
      const { from, to } = view.state.selection
      if (!plugin.props.handleTextInput(view, from, to, text))
        view.dispatch(view.state.tr.insertText(text, from, to))
    },
    content() {
      return JSON.parse(
        JSON.stringify(view.state.doc.firstChild.toJSON().content)
      )
    },
  }
}

test('ordinary delimiter input creates a mention and keeps the prefix', () => {
  const editor = editorWith('hello @MODS')
  editor.input(' ')
  assert.deepEqual(editor.content(), [
    { type: 'text', text: 'hello ' },
    { type: 'mention', attrs: { id: 'test-mods', label: 'mods' } },
    { type: 'text', text: ' ' },
  ])
})

for (const prefix of ['', 'hello ']) {
  test(`batched token suffix preserves text after prefix ${JSON.stringify(
    prefix
  )}`, () => {
    const editor = editorWith(`${prefix}@mod`)
    editor.input('s ')
    assert.deepEqual(editor.content(), [
      { type: 'text', text: `${prefix}@mods ` },
    ])
  })
}

test('compositionend leaves the already-committed delimiter intact', async () => {
  const editor = editorWith('@mods ')
  editor.plugin.props.handleDOMEvents.compositionend(editor.view, {})
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.deepEqual(editor.content(), [{ type: 'text', text: '@mods ' }])
})

test('selected text replacement does not turn into a mention', () => {
  const editor = editorWith('@modsXYZ')
  editor.view.dispatch(
    editor.view.state.tr.setSelection(
      TextSelection.create(editor.view.state.doc, 6, 9)
    )
  )
  editor.input(' ')
  assert.deepEqual(editor.content(), [{ type: 'text', text: '@mods ' }])
})
