// adapted from @n8body/tiptap-spoiler

import {
  Mark,
  markInputRule,
  markPasteRule,
  mergeAttributes,
} from '@tiptap/core'
import type { ElementType } from 'react'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    spoilerEditor: {
      setSpoiler: () => ReturnType
      toggleSpoiler: () => ReturnType
      unsetSpoiler: () => ReturnType
    }
  }
}

export type SpoilerOptions = {
  HTMLAttributes: Record<string, any>
  spoilerOpenClass: string
  spoilerCloseClass?: string
  inputRegex: RegExp
  pasteRegex: RegExp
  as: ElementType
}

const spoilerInputRegex = /(?:^|\s)((?:\|\|)((?:[^||]+))(?:\|\|))$/
const spoilerPasteRegex = /(?:^|\s)((?:\|\|)((?:[^||]+))(?:\|\|))/g

export const TiptapSpoiler = Mark.create<SpoilerOptions>({
  name: 'spoiler',

  inline: true,
  group: 'inline',
  inclusive: false,
  exitable: true,
  content: 'inline*',

  priority: 1001, // higher priority than other formatting so they go inside

  addOptions() {
    return {
      HTMLAttributes: { 'aria-label': 'spoiler' },
      spoilerOpenClass: '',
      spoilerCloseClass: undefined,
      inputRegex: spoilerInputRegex,
      pasteRegex: spoilerPasteRegex,
      as: 'span',
      editing: false,
    }
  },

  addCommands() {
    return {
      setSpoiler:
        () =>
        ({ commands }) =>
          commands.setMark(this.name),
      toggleSpoiler:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name),
      unsetSpoiler:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    }
  },

  addInputRules() {
    return [
      markInputRule({
        find: this.options.inputRegex,
        type: this.type,
      }),
    ]
  },

  addPasteRules() {
    return [
      markPasteRule({
        find: this.options.pasteRegex,
        type: this.type,
      }),
    ]
  },

  parseHTML() {
    return [
      {
        tag: 'span',
        getAttrs: (node) =>
          (node as HTMLElement).ariaLabel?.toLowerCase() === 'spoiler' && null,
      },
    ]
  },

  // TODO: actually set class to open class on click
  renderHTML({ HTMLAttributes }) {
    return [
      'spoiler',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: this.options.spoilerCloseClass ?? this.options.spoilerOpenClass,
      }),
    ]
  },
})
