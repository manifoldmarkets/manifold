// Adopted from https://github.com/ueberdosis/tiptap/blob/main/demos/src/Experiments/Embeds/Vue/iframe.ts

import { Node, mergeAttributes } from '@tiptap/core'
import { IS_NATIVE_KEY } from 'common/native-message'

//TODO: this should actually just return true for ANY mobile browser (not just native apps),
// but will cause hydration errors if we do that check outside a useEffect.
const getIsNative = () => {
  if (typeof window === 'undefined') return false
  const isNative =
    localStorage?.getItem(IS_NATIVE_KEY) ||
    sessionStorage?.getItem(IS_NATIVE_KEY)
  return isNative === 'true'
}

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
        sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups',
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
    const isNative = getIsNative()
    const iframeAttributes = mergeAttributes(
      this.options.HTMLAttributes,
      HTMLAttributes
    )
    const { src } = HTMLAttributes

    // This is a hack to prevent native apps from opening the iframe in an in-app browser:
    // links with target='_blank' will open in the in-app browser.
    if (isNative && src.includes('manifold.markets/embed/')) {
      return [
        'div',
        {
          style: {
            position: 'relative',
          },
          ...this.options.HTMLAttributes,
        },
        [
          'a',
          {
            href: src.replace('embed/', ''),
            target: '_self',
            style: {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 10000,
              display: 'block',
            },
          },
        ],
        ['iframe', iframeAttributes],
      ]
    }

    return ['iframe', iframeAttributes]
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
