import { useState, useRef, useEffect } from 'react'
import clsx from 'clsx'
import { removeEmojis } from 'common/util/string'

export function EditableQuestionPreview(props: {
  question: string
  onChange: (question: string) => void
  placeholder?: string
  maxLength?: number
  className?: string
}) {
  const {
    question,
    onChange,
    placeholder = "What's your question?",
    maxLength = 120,
    className,
  } = props
  const [isEditing, setIsEditing] = useState(false)
  const [localValue, setLocalValue] = useState(question)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setLocalValue(question)
  }, [question])

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      // Auto-resize
      adjustHeight()
    }
  }, [isEditing])

  const adjustHeight = () => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = textarea.scrollHeight + 'px'
    }
  }

  const handleSave = () => {
    onChange(localValue.trim())
    setIsEditing(false)
  }

  const handleCancel = () => {
    setLocalValue(question)
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

  const displayText = question ? removeEmojis(question) : placeholder
  const isOverLimit = localValue.length > maxLength
  const charsRemaining = maxLength - localValue.length

  if (!isEditing) {
    return (
      <button
        onClick={() => setIsEditing(true)}
        className={clsx(
          'text-ink-1000 group w-full text-left text-lg font-semibold transition-colors sm:text-xl',
          !question && 'text-ink-400',
          'hover:bg-ink-50 -mx-2 cursor-text rounded px-2 py-1',
          className
        )}
      >
        {displayText}
        <span className="text-primary-500 ml-2 opacity-0 transition-opacity group-hover:opacity-100">
          Click to edit
        </span>
      </button>
    )
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={localValue}
        onChange={(e) => {
          setLocalValue(e.target.value)
          adjustHeight()
        }}
        onKeyDown={handleKeyDown}
        onBlur={handleSave}
        placeholder={placeholder}
        className={clsx(
          'text-ink-1000 w-full resize-none overflow-hidden rounded border-2 px-2 py-1 text-lg font-semibold outline-none sm:text-xl',
          isOverLimit ? 'border-scarlet-500' : 'border-primary-500',
          'focus:ring-2',
          isOverLimit ? 'focus:ring-scarlet-200' : 'focus:ring-primary-200',
          className
        )}
        rows={1}
      />
      <div className="mt-1 flex items-center justify-between">
        <span
          className={clsx(
            'text-xs',
            isOverLimit ? 'text-scarlet-500 font-semibold' : 'text-ink-400'
          )}
        >
          {isOverLimit
            ? `${-charsRemaining} characters over limit`
            : `${charsRemaining} characters remaining`}
        </span>
        <div className="flex gap-2">
          <button
            onClick={handleCancel}
            className="text-ink-600 hover:text-ink-800 text-xs"
          >
            Cancel (Esc)
          </button>
          <button
            onClick={handleSave}
            disabled={isOverLimit}
            className={clsx(
              'text-xs',
              isOverLimit
                ? 'text-ink-400 cursor-not-allowed'
                : 'text-primary-600 hover:text-primary-700'
            )}
          >
            Save (Enter)
          </button>
        </div>
      </div>
    </div>
  )
}
