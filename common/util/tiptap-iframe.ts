// Adopted from https://github.com/ueberdosis/tiptap/blob/main/demos/src/Experiments/Embeds/Vue/iframe.ts

import { Node } from '@tiptap/core'

export interface IframeOptions {
  allowFullscreen: boolean
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

// These classes style the outer wrapper and the inner iframe;
// Adopted from css in https://github.com/ueberdosis/tiptap/blob/main/demos/src/Experiments/Embeds/Vue/index.vue
const wrapperClasses = 'relative h-auto w-full overflow-hidden'
const iframeClasses = 'absolute top-0 left-0 h-full w-full'

export default Node.create<IframeOptions>({
  name: 'iframe',

  group: 'block',

  atom: true,

  addOptions() {
    return {
      allowFullscreen: true,
      HTMLAttributes: {
        class: 'iframe-wrapper' + ' ' + wrapperClasses,
        // Tailwind JIT doesn't seem to pick up `pb-[20rem]`, so we hack this in:
        style: 'padding-bottom: 20rem; ',
      },
    }
  },

  addAttributes() {
    return {
      src: {
        default: null,
      },
      frameborder: {
        default: 0,
      },
      height: {
        default: 0,
      },
      allowfullscreen: {
        default: this.options.allowFullscreen,
        parseHTML: () => this.options.allowFullscreen,
      },
    }
  },

  parseHTML() {
    return [{ tag: 'iframe' }]
  },

  renderHTML({ HTMLAttributes }) {
    this.options.HTMLAttributes.style =
      this.options.HTMLAttributes.style +
      ' height: ' +
      HTMLAttributes.height +
      ';'
    return [
      'div',
      this.options.HTMLAttributes,
      [
        'iframe',
        {
          ...HTMLAttributes,
          class: HTMLAttributes.class + ' ' + iframeClasses,
        },
      ],
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
