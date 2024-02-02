import { forwardRef, MouseEventHandler, ReactNode, Ref } from 'react'
import clsx from 'clsx'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'

export type SizeType = '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'

const sizeClasses = {
  '2xs': 'px-2 py-1 text-xs ring-[1.5px]',
  xs: 'px-2 text-xs ring-[1.5px] h-6',
  sm: 'px-3 py-2 text-sm ring-2',
  md: 'px-4 py-2 text-sm ring-2',
  lg: 'px-4 py-2 text-base ring-2',
  xl: 'px-6 py-2.5 text-base font-semibold ring-2',
  '2xl': 'px-6 py-3 text-xl font-semibold ring-2',
}

const baseButtonClasses =
  'font-md inline-flex items-center justify-center ring-inset transition-colors disabled:cursor-not-allowed text-center ring-ink-1000 bg-ink-0 hover:text-ink-0 hover:bg-ink-1000'

export function buttonClass(size: SizeType) {
  return clsx(baseButtonClasses, sizeClasses[size])
}

export const Button = forwardRef(function Button(
  props: {
    className?: string
    size?: SizeType
    type?: 'button' | 'reset' | 'submit'
    loading?: boolean
  } & JSX.IntrinsicElements['button'],
  ref: Ref<HTMLButtonElement>
) {
  const {
    children,
    className,
    size = 'md',
    type = 'button',
    disabled = false,
    loading,
    ...rest
  } = props

  return (
    <button
      type={type}
      className={clsx(buttonClass(size), className)}
      disabled={disabled || loading}
      ref={ref}
      {...rest}
    >
      {loading && (
        <LoadingIndicator
          className="mr-2 w-fit self-stretch"
          size={size === '2xs' || size === 'xs' ? 'sm' : 'md'}
          spinnerClassName="!w-[unset] aspect-square"
        />
      )}
      {children}
    </button>
  )
})

export function IconButton(props: {
  className?: string
  onClick?: MouseEventHandler<any> | undefined
  children?: ReactNode
  size?: SizeType
  type?: 'button' | 'reset' | 'submit'
  disabled?: boolean
}) {
  const {
    children,
    className,
    onClick,
    size = 'md',
    type = 'button',
    disabled = false,
  } = props

  return (
    <Button
      type={type}
      size={size}
      color="gray-white"
      className={className}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}
