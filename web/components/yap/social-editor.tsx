import { mergeAttributes, type JSONContent } from '@tiptap/core'
import Mention, {
  MentionPluginKey,
  type MentionOptions,
} from '@tiptap/extension-mention'
import Placeholder from '@tiptap/extension-placeholder'
import { EditorContent, ReactRenderer, useEditor } from '@tiptap/react'
import type { SuggestionKeyDownProps } from '@tiptap/suggestion'
import StarterKit from '@tiptap/starter-kit'
import { PluginKey } from 'prosemirror-state'
import { ReactNode, useEffect, useRef } from 'react'
import tippy, { type Instance } from 'tippy.js'
import {
  socialRichContentToText,
  textToSocialRichContent,
} from 'common/social-rich-content'
import { searchContracts } from 'web/lib/api/api'
import { contractMentionSuggestion } from '../editor/contract-mention/contract-mention-suggestion'
import { MentionList as MarketMentionList } from '../editor/contract-mention/contract-mention-list'
import { nodeViewMiddleware } from '../editor/nodeview-middleware'
import { DisplayMention } from '../editor/user-mention/mention-extension'
import { MentionList as UserMentionList } from '../editor/user-mention/mention-list'
import { mentionSuggestion } from '../editor/user-mention/mention-suggestion'
import { SocialEmoji } from './social-emoji'
import { socialMarketMentionLabel } from './social-rich-content'

// Keep popups within modal focus boundaries, without depending on Tippy's CSS.
function makeSocialMentionRender(
  mentionList: any
): NonNullable<MentionOptions['suggestion']['render']> {
  return () => {
    let component: ReactRenderer | undefined
    let popup: Instance | undefined
    return {
      onStart: (props) => {
        component = new ReactRenderer(mentionList, {
          props,
          editor: props.editor,
        })
        if (!props.clientRect) return
        popup = tippy(props.editor.view.dom, {
          getReferenceClientRect: props.clientRect as () => DOMRect,
          appendTo: () =>
            props.editor.view.dom.closest('[data-social-composer]') ??
            props.editor.view.dom.parentElement ??
            document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: 'manual',
          placement: 'bottom-start',
          animation: false,
          duration: 0,
        })
      },
      onUpdate: (props) => {
        component?.updateProps(props)
        if (props.clientRect)
          popup?.setProps({
            getReferenceClientRect: props.clientRect as () => DOMRect,
          })
      },
      onKeyDown: (props) => {
        if (props.event.key === 'Escape') {
          popup?.hide()
          return true
        }
        if (!popup?.state.isVisible) return false
        const ref = component?.ref as {
          onKeyDown?: (props: SuggestionKeyDownProps) => boolean
        } | null
        return ref?.onKeyDown?.(props) ?? false
      },
      onExit: () => {
        popup?.destroy()
        component?.destroy()
        popup = undefined
        component = undefined
      },
    }
  }
}

const UserMention = DisplayMention.configure({
  suggestion: {
    ...mentionSuggestion,
    render: makeSocialMentionRender(UserMentionList),
  },
})
const marketSuggestionKey = new PluginKey('yap-contract-mention')
const MarketMention = Mention.extend({
  name: 'contract-mention',
  parseHTML: () => [
    { tag: 'contract-mention-component' },
    { tag: '[data-type="contract-mention-component"]' },
  ],
  renderHTML: ({ node, HTMLAttributes }) => [
    'span',
    mergeAttributes(
      { 'data-type': 'contract-mention-component' },
      HTMLAttributes
    ),
    '%' + socialMarketMentionLabel(node.attrs.label ?? ''),
  ],
  renderReact: (attrs: { label?: string }) => (
    <span className="text-primary-700">
      %{socialMarketMentionLabel(attrs.label ?? '')}
    </span>
  ),
}).configure({
  suggestion: {
    ...contractMentionSuggestion,
    pluginKey: marketSuggestionKey,
    render: makeSocialMentionRender(MarketMentionList),
    items: async ({ query }) =>
      (
        await searchContracts({
          term: query,
          filter: 'all',
          sort: 'score',
          limit: 10,
        })
      )
        .filter(
          (contract) => contract.visibility === 'public' && !contract.deleted
        )
        .slice(0, 5),
  },
})

export function SocialEditor({
  value,
  text,
  onChange,
  onImages,
  onSubmit,
  disabled,
  placeholder,
  ariaLabel,
  focusOnMount,
}: {
  value: JSONContent | undefined | null
  text: string
  onChange: (richContent: JSONContent, text: string) => void
  onImages: (files: File[]) => void
  onSubmit: () => void
  disabled: boolean
  placeholder: string
  ariaLabel: string
  focusOnMount?: boolean
}) {
  const callbacks = useRef({ onChange, onImages, onSubmit, disabled })
  callbacks.current = { onChange, onImages, onSubmit, disabled }
  const initial = useRef(value ?? textToSocialRichContent(text))
  const editor = useEditor({
    content: initial.current,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        bold: false,
        italic: false,
        strike: false,
        code: false,
        heading: false,
        horizontalRule: false,
        codeBlock: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
      }),
      SocialEmoji,
      ...nodeViewMiddleware([UserMention, MarketMention]),
      Placeholder.configure({
        placeholder,
        emptyEditorClass:
          'before:content-[attr(data-placeholder)] before:text-ink-600 before:float-left before:h-0 cursor-text',
      }),
    ],
    onUpdate: ({ editor }) => {
      const content = editor.getJSON()
      callbacks.current.onChange(content, socialRichContentToText(content))
    },
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-label': ariaLabel,
        'aria-multiline': 'true',
        class:
          'text-ink-900 [&_p]:my-0 min-h-[5.5rem] max-w-none break-words p-3 text-base outline-none [overflow-wrap:anywhere]',
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter(
          (file) => file.type.startsWith('image/')
        )
        if (!files.length) return false
        event.preventDefault()
        if (!callbacks.current.disabled) callbacks.current.onImages(files)
        return true
      },
      handleKeyDown: (view, event) => {
        if (
          event.key !== 'Enter' ||
          !(event.ctrlKey || event.metaKey) ||
          event.isComposing ||
          MentionPluginKey.getState(view.state)?.active ||
          marketSuggestionKey.getState(view.state)?.active
        )
          return false
        event.preventDefault()
        if (!callbacks.current.disabled) callbacks.current.onSubmit()
        return true
      },
    },
  })

  useEffect(() => {
    if (!editor) return
    const content = value ?? textToSocialRichContent(text)
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(content))
      editor.commands.setContent(content, false)
  }, [editor, value, text])

  useEffect(() => {
    editor?.setEditable(!disabled)
  }, [editor, disabled])

  useEffect(() => {
    if (editor && focusOnMount) editor.commands.focus('end')
  }, [editor, focusOnMount])

  const insertTrigger = (trigger: '@' | '%') => {
    if (!editor) return
    const previous = editor.state.selection.$from.nodeBefore
    const prefix =
      previous && (!previous.isText || !/\s$/.test(previous.text ?? ''))
        ? ' '
        : ''
    editor
      .chain()
      .focus()
      .insertContent(prefix + trigger)
      .run()
  }
  const tool = (label: string, children: ReactNode, onClick: () => void) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled || !editor}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="text-ink-600 hover:bg-ink-100 flex h-8 min-w-[2rem] items-center justify-center rounded px-2 text-sm disabled:opacity-40"
    >
      {children}
    </button>
  )
  return (
    <div className="bg-canvas-50 border-ink-300 focus-within:border-primary-500 focus-within:ring-primary-500 mb-3 rounded-2xl border focus-within:ring-1">
      <EditorContent editor={editor} />
      <div
        role="toolbar"
        aria-label="Post tools"
        className="border-ink-200 flex flex-wrap items-center gap-0.5 border-t px-2 py-1"
      >
        {tool('Tag a person', '@', () => insertTrigger('@'))}
        {tool('Reference a market', '%', () => insertTrigger('%'))}
      </div>
      <p className="text-ink-500 px-3 pb-2 text-xs">
        Use @ to tag people, % to reference markets, and :laugh: for 😆.
      </p>
    </div>
  )
}
