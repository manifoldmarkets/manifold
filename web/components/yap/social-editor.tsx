import { mergeAttributes, type JSONContent } from '@tiptap/core'
import TiptapLink from '@tiptap/extension-link'
import Mention, {
  MentionPluginKey,
  type MentionOptions,
} from '@tiptap/extension-mention'
import Placeholder from '@tiptap/extension-placeholder'
import { EditorContent, ReactRenderer, useEditor } from '@tiptap/react'
import type { SuggestionKeyDownProps } from '@tiptap/suggestion'
import StarterKit from '@tiptap/starter-kit'
import clsx from 'clsx'
import { PluginKey } from 'prosemirror-state'
import { ReactNode, useEffect, useRef, useState } from 'react'
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
import {
  isSocialRichLink,
  socialMarketMentionLabel,
} from './social-rich-content'

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

const PostLink = TiptapLink.extend({
  parseHTML: () => [
    {
      tag: 'a[href]',
      getAttrs: (element) =>
        isSocialRichLink((element as HTMLElement).getAttribute('href'))
          ? null
          : false,
    },
  ],
}).configure({
  openOnClick: false,
  validate: isSocialRichLink,
  HTMLAttributes: {
    class: 'text-primary-700 hover:underline',
    target: '_blank',
    rel: 'noopener noreferrer ugc',
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
  const linkInput = useRef<HTMLInputElement>(null)
  const [linkUrl, setLinkUrl] = useState<string | null>(null)
  const [linkError, setLinkError] = useState<string>()
  const editor = useEditor({
    content: initial.current,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: false,
        horizontalRule: false,
        codeBlock: false,
      }),
      PostLink,
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
          'prose prose-sm dark:prose-invert text-ink-900 prose-p:my-0 prose-ul:my-0 prose-ol:my-0 prose-li:my-0 min-h-[5.5rem] max-w-none break-words p-3 text-base outline-none [overflow-wrap:anywhere]',
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
    if (disabled) setLinkUrl(null)
  }, [editor, disabled])

  useEffect(() => {
    if (editor && focusOnMount) editor.commands.focus('end')
  }, [editor, focusOnMount])

  useEffect(() => {
    if (linkUrl !== null) linkInput.current?.focus()
  }, [linkUrl !== null])

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
  const saveLink = () => {
    const href = linkUrl?.trim()
    if (!isSocialRichLink(href)) {
      setLinkError('Use an http:// or https:// link.')
      return
    }
    if (!editor) return
    if (editor.state.selection.empty && !editor.isActive('link')) {
      editor
        .chain()
        .focus()
        .insertContent([
          {
            type: 'text',
            text: href,
            marks: [{ type: 'link', attrs: { href } }],
          },
          { type: 'text', text: ' ' },
        ])
        .run()
    } else
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
    setLinkUrl(null)
    setLinkError(undefined)
  }
  const tool = (
    label: string,
    children: ReactNode,
    onClick: () => void,
    active = false
  ) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled || !editor}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={clsx(
        'hover:bg-ink-100 flex h-8 min-w-[2rem] items-center justify-center rounded px-2 text-sm disabled:opacity-40',
        active ? 'bg-primary-500/10 text-primary-700' : 'text-ink-600'
      )}
    >
      {children}
    </button>
  )
  return (
    <div className="bg-canvas-50 border-ink-300 focus-within:border-primary-500 focus-within:ring-primary-500 mb-3 rounded-2xl border focus-within:ring-1">
      <EditorContent editor={editor} />
      <div
        role="toolbar"
        aria-label="Post formatting"
        className="border-ink-200 flex flex-wrap items-center gap-0.5 border-t px-2 py-1"
      >
        {tool(
          'Bold',
          <strong>B</strong>,
          () => editor?.chain().focus().toggleBold().run(),
          editor?.isActive('bold')
        )}
        {tool(
          'Italic',
          <em>I</em>,
          () => editor?.chain().focus().toggleItalic().run(),
          editor?.isActive('italic')
        )}
        {tool(
          'Strikethrough',
          <s>S</s>,
          () => editor?.chain().focus().toggleStrike().run(),
          editor?.isActive('strike')
        )}
        {tool(
          'Inline code',
          <span className="font-mono">{'<>'}</span>,
          () => editor?.chain().focus().toggleCode().run(),
          editor?.isActive('code')
        )}
        {tool(
          'Bulleted list',
          '• List',
          () => editor?.chain().focus().toggleBulletList().run(),
          editor?.isActive('bulletList')
        )}
        {tool(
          'Numbered list',
          '1. List',
          () => editor?.chain().focus().toggleOrderedList().run(),
          editor?.isActive('orderedList')
        )}
        {tool(
          'Quote',
          '❝',
          () => editor?.chain().focus().toggleBlockquote().run(),
          editor?.isActive('blockquote')
        )}
        {tool(
          'Add or edit link',
          'Link',
          () => {
            setLinkUrl(editor?.getAttributes('link').href ?? '')
            setLinkError(undefined)
          },
          editor?.isActive('link')
        )}
        {tool('Tag a person', '@', () => insertTrigger('@'))}
        {tool('Reference a market', '%', () => insertTrigger('%'))}
      </div>
      {linkUrl !== null && (
        <div className="border-ink-200 border-t p-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="url"
              aria-label="Link URL"
              placeholder="https://example.com"
              value={linkUrl}
              ref={linkInput}
              className="bg-canvas-0 border-ink-300 min-w-0 flex-1 rounded border px-2 py-1 text-sm"
              onChange={(event) => setLinkUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  saveLink()
                } else if (event.key === 'Escape') {
                  setLinkUrl(null)
                  editor?.commands.focus()
                }
              }}
            />
            <button
              type="button"
              className="text-primary-700 text-sm"
              onClick={saveLink}
            >
              Save link
            </button>
            {editor?.isActive('link') && (
              <button
                type="button"
                className="text-ink-600 text-sm"
                onClick={() => {
                  editor
                    .chain()
                    .focus()
                    .extendMarkRange('link')
                    .unsetLink()
                    .run()
                  setLinkUrl(null)
                }}
              >
                Remove link
              </button>
            )}
            <button
              type="button"
              className="text-ink-600 text-sm"
              onClick={() => {
                setLinkUrl(null)
                editor?.commands.focus()
              }}
            >
              Cancel
            </button>
          </div>
          {linkError && (
            <p role="alert" className="mt-1 text-sm text-red-600">
              {linkError}
            </p>
          )}
        </div>
      )}
      <p className="text-ink-500 px-3 pb-2 text-xs">
        Use @ to tag people and % to reference markets.
      </p>
    </div>
  )
}
