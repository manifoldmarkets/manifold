import { ReactNode } from 'react'
import clsx from 'clsx'

export function Button(props: {
  className?: string
  onClick?: () => void
  children?: ReactNode
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  color?: 'green' | 'red' | 'blue' | 'indigo' | 'yellow' | 'gray'
  type?: 'button' | 'reset' | 'submit'
  disabled?: boolean
}) {
  const {
    children,
    className,
    onClick,
    size = 'md',
    color = 'indigo',
    type = 'button',
    disabled = false,
  } = props

  const sizeClasses = {
    xs: 'px-2.5 py-1.5 text-sm',
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-4 py-2 text-base',
    xl: 'px-6 py-3 text-base',
  }[size]

  return (
    <button
      type={type}
      className={clsx(
        'font-md items-center justify-center rounded-md border border-transparent shadow-sm hover:transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        sizeClasses,
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
