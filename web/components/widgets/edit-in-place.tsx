import { ReactNode, useState } from 'react'
import { ExpandingInput } from './expanding-input'

export const EditInPlaceInput = (props: {
  className?: string
  disabled?: boolean
  initialValue?: string
  onSave: (value: string) => void
  /** The text to show when input is not focused. Required. */
  children: (value: string) => ReactNode
}) => {
  const { className, disabled, initialValue = '', onSave, children } = props
  const [value, setValue] = useState(initialValue)
  const [editing, setEditing] = useState(false)

  const save = () => {
    onSave(value)
    setEditing(false)
  }

  return editing ? (
    <ExpandingInput
      className={className}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === 'Enter' && save()}
      autoFocus
      onFocus={(e) => {
        // move cursor to end
        e.target.value = ' '
        e.target.value = value
      }}
    />
  ) : (
    <div
      role={disabled ? undefined : 'button'}
      tabIndex={disabled ? undefined : 0}
      onClick={() => !disabled && setEditing(true)}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          setEditing(true)
        }
      }}
    >
      {children(value)}
    </div>
  )
}
