// Adopted from https://github.com/ueberdosis/tiptap/blob/main/demos/src/Experiments/Embeds/Vue/iframe.ts

import { Node, mergeAttributes } from '@tiptap/core'

export interface IframeOptions {
  HTMLAttributes: {
    [key: string]: any
  }
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    iframe: {
      setIframe: (options: { src: string }) => ReturnType
    }
  }
}

export default Node.create<IframeOptions>({
  name: 'iframe',

  group: 'block',

  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {
        class: 'w-full h-80',
        height: 80 * 4,
        sandbox: 'allow-scripts allow-same-origin allow-forms',
      },
    }
  },

  addAttributes() {
    return {
      src: {
        default: null,
      },
      frameBorder: {
        default: 0,
      },
    }
  },

  parseHTML() {
    return [{ tag: 'iframe' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'iframe',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
    ]
  },

  addCommands() {
    return {
      setIframe:
        (options: { src: string }) =>
        ({ tr, dispatch }) => {
          const { selection } = tr
          const node = this.type.create(options)

          if (dispatch) {
            tr.replaceRangeWith(selection.from, selection.to, node)
          }

          return true
        },
    }
  },
})
