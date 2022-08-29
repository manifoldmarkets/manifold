import { ReactNode } from 'react'
import clsx from 'clsx'

export type SizeType = '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
export type ColorType =
  | 'green'
  | 'red'
  | 'blue'
  | 'indigo'
  | 'yellow'
  | 'gray'
  | 'gradient'
  | 'gray-white'

export function Button(props: {
  className?: string
  onClick?: () => void
  children?: ReactNode
  size?: SizeType
  color?: ColorType
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
    '2xs': 'px-2 py-1 text-xs',
    xs: 'px-2.5 py-1.5 text-sm',
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-4 py-2 text-base',
    xl: 'px-6 py-2.5 text-base font-semibold',
    '2xl': 'px-6 py-3 text-xl font-semibold',
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
        color === 'gray' && 'bg-gray-50 text-gray-600 hover:bg-gray-200',
        color === 'gradient' &&
          'border-none bg-gradient-to-r from-indigo-500 to-blue-500 text-white hover:from-indigo-700 hover:to-blue-700',
        color === 'gray-white' &&
          'border-none bg-white text-gray-500 shadow-none hover:bg-gray-200',
        className
      )}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
