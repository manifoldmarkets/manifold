import { Editor, Content } from '@tiptap/react'

export function appendToEditor(editor: Editor | null, content: Content) {
  editor
    ?.chain()
    .focus('end')
    .createParagraphNear()
    .insertContent(content)
    .run()
}
