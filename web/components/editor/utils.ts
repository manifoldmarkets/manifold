import { Editor, Content } from '@tiptap/react'

export function insertContent(editor: Editor | null, ...contents: Content[]) {
  if (!editor) {
    return
  }

  let e = editor.chain()
  for (const content of contents) {
    e = e.createParagraphNear().insertContent(content)
  }
  e.run()
}
