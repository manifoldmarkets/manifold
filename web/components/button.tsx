import { ReactNode } from 'react'
import clsx from 'clsx'

export default function Button(props: {
  className?: string
  onClick?: () => void
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  color?: 'green' | 'red' | 'blue' | 'indigo' | 'yellow' | 'gray'
  children?: ReactNode
  type?: 'button' | 'reset' | 'submit'
  disabled?: boolean
}) {
  const {
    children,
    className,
    onClick,
    size='md',
    color = 'indigo',
    type = 'button',
    disabled = false
  } = props

  return (
    <button
      type={type}
      className={clsx(
        'font-md items-center justify-center rounded-md border border-transparent px-4 py-2 shadow-sm hover:transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        color === 'green' && 'btn-primary text-white',
        color === 'red' && 'bg-red-400 text-white hover:bg-red-500',
        color === 'yellow' && 'bg-yellow-400 text-white hover:bg-yellow-500',
        color === 'blue' && 'bg-blue-400 text-white hover:bg-blue-500',
        color === 'indigo' && 'bg-indigo-500 text-white hover:bg-indigo-600',
        color === 'gray' && 'bg-gray-200 text-gray-700 hover:bg-gray-300',
        className
      )}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
