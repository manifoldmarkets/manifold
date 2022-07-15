import { ReactNode } from 'react'
import clsx from 'clsx'

export function Button(props: {
  children: ReactNode
  className?: string
  onClick?: () => void
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  color?: 'green' | 'red' | 'blue' | 'indigo' | 'yellow' | 'gray'
  type?: 'button' | 'reset' | 'submit'
}) {
  const {
    children,
    className,
    onClick,
    size = 'md',
    color = 'indigo',
    type = 'button',
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
        'font-md items-center justify-center rounded-md border border-transparent shadow-sm hover:transition-colors',
        sizeClasses,
        color === 'green' && 'btn-primary text-white',
        color === 'red' && 'bg-red-400 text-white hover:bg-red-500',
        color === 'yellow' && 'bg-yellow-400 text-white hover:bg-yellow-500',
        color === 'blue' && 'bg-blue-400 text-white hover:bg-blue-500',
        color === 'indigo' && 'bg-indigo-500 text-white hover:bg-indigo-600',
        color === 'gray' && 'bg-gray-200 text-gray-700 hover:bg-gray-300',
        className
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
