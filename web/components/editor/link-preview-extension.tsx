// LinkPreviewExtension.ts
import { mergeAttributes, Node } from '@tiptap/core'
// fetchLinkPreview.ts

interface LinkPreviewOptions {
  HTMLAttributes: Record<string, unknown>
}
const name = 'linkPreview'
export const LinkPreviewExtension = Node.create<LinkPreviewOptions>({
  name,
  atom: true,

  group: 'block',
  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  addAttributes() {
    return {
      url: {
        default: null,
      },
      title: {
        default: null,
      },
      description: {
        default: null,
      },
      image: {
        default: null,
      },
    }
  },
  addNodeView() {
    return LinkPreviewNodeView
  },

  parseHTML() {
    return [
      {
        tag: name,
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    console.log('HTMLAttributes', HTMLAttributes)
    return [name, mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)]
  },
})

/// components/LinkPreviewEditor.tsx
import React, { useState } from 'react'
import axios from 'axios'
import { Editor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import LinkPreviewNodeView from 'web/components/editor/link-preview-node-view'
import { nodeViewMiddleware } from 'web/components/editor/nodeview-middleware'

export const LinkPreviewEditor = () => {
  const editor = new Editor({
    extensions: nodeViewMiddleware([StarterKit, LinkPreviewExtension]),
    content: '',
  })

  const [url, setUrl] = useState('')

  const handleAddLinkPreview = async () => {
    try {
      const { data: metadata } = await axios.post(
        '/api/v0/fetch-link-preview',
        {
          url,
        }
      )

      // Generate a JSON representation of the linkPreview node
      const linkPreviewNodeJSON = {
        type: 'linkPreview',
        attrs: metadata,
      }

      editor.chain().focus().insertContent(linkPreviewNodeJSON).run()

      setUrl('')
    } catch (error) {
      console.error('Error fetching link preview:', error)
    }
  }

  return (
    <div>
      <input
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Enter URL"
      />
      <button onClick={handleAddLinkPreview}>Add Link Preview</button>
      <EditorContent className={'h-32'} editor={editor} />
    </div>
  )
}
