import { Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react'
import { XIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { CSSProperties, ReactNode, useEffect, useRef } from 'react'
import { useVisualViewport } from 'web/hooks/use-visual-viewport'

export const MODAL_CLASS = // card color and spacing
  'items-center gap-4 rounded-md bg-canvas-0 sm:px-8 px-4 py-6 text-ink-1000'
export const SCROLLABLE_MODAL_CLASS =
  'max-h-[70vh] min-h-[20rem] !overflow-auto'

// From https://tailwindui.com/components/application-ui/overlays/modals
export function Modal(props: {
  children: ReactNode
  open: boolean
  setOpen?: (open: boolean) => void
  size?: 'sm' | 'md' | 'mdlg' | 'lg' | 'xl'
  position?: 'center' | 'top' | 'bottom'
  className?: string
  onClose?: () => void
  ariaLabel?: string
  hideCloseButton?: boolean
  adaptToKeyboard?: boolean
  closeButtonPosition?: 'inside' | 'outside'
}) {
  const {
    children,
    position = 'center',
    open,
    setOpen,
    size = 'md',
    className,
    onClose,
    ariaLabel,
    hideCloseButton = false,
    adaptToKeyboard = false,
    closeButtonPosition = 'outside',
  } = props

  const viewport = useVisualViewport(open && adaptToKeyboard)
  const viewportStyle:
    | (CSSProperties & {
        '--modal-viewport-height'?: string
        '--modal-top-spacing': string
      })
    | undefined = adaptToKeyboard
    ? {
        // Leave room for the form and footer when the keyboard is open.
        '--modal-top-spacing':
          closeButtonPosition === 'inside'
            ? 'clamp(0px, calc(var(--modal-viewport-height, 100dvh) - 12rem), 1rem)'
            : 'clamp(0px, calc(var(--modal-viewport-height, 100dvh) - 12rem), 5rem)',
        ...(viewport && {
          top: viewport.offsetTop,
          bottom: 'auto',
          height: viewport.height,
          '--modal-viewport-height': `${viewport.height}px`,
        }),
      }
    : undefined

  const sizeClass = {
    sm: 'w-full sm:max-w-sm',
    md: 'w-full sm:max-w-lg',
    mdlg: 'w-full sm:max-w-xl',
    lg: 'w-full max-w-2xl',
    xl: 'w-full max-w-5xl',
  }[size]

  const positionClass = {
    center: 'self-end sm:self-center',
    top: 'self-end sm:self-start sm:mt-8',
    bottom: 'self-end sm:mb-8',
  }[position]

  const wasOpenRef = useRef(open)

  useEffect(() => {
    if (wasOpenRef.current && !open && onClose) {
      onClose()
    }
    wasOpenRef.current = open
  }, [open, onClose])

  return (
    <Dialog
      className="text-ink-1000 relative z-50 focus:outline-none"
      open={open}
      onClose={setOpen ?? (() => {})}
      aria-label={ariaLabel}
      // prevent modal from re-opening from bubbled event if Modal is child of the open button
      onClick={(e: any) => e.stopPropagation()}
    >
      <DialogBackdrop
        transition
        className="bg-canvas-100/75 fixed inset-0 transition-opacity data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in"
      />

      <div
        className={clsx(
          'fixed inset-0 z-10 w-screen overflow-y-auto sm:p-0',
          adaptToKeyboard ? 'pt-[var(--modal-top-spacing)]' : 'pt-20'
        )}
        style={viewportStyle}
      >
        <div className="flex min-h-full justify-center overflow-hidden">
          <DialogPanel
            transition
            className={clsx(
              'transition-opacity data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in',
              'relative',
              sizeClass,
              positionClass,
              className
            )}
          >
            {children}

            {setOpen && !hideCloseButton && (
              <button
                onClick={() => setOpen(false)}
                aria-label="Close dialog"
                className={clsx(
                  'text-ink-700 hover:text-primary-400 focus:text-primary-400 absolute cursor-pointer outline-none',
                  closeButtonPosition === 'inside'
                    ? 'focus-visible:ring-primary-500 right-2 top-2 rounded-md p-1 focus-visible:ring-2'
                    : '-top-4 right-4 -translate-y-full sm:right-0',
                  closeButtonPosition === 'outside' &&
                    position === 'top' &&
                    'sm:-bottom-4 sm:top-auto sm:translate-y-full'
                )}
              >
                <XIcon
                  className={
                    closeButtonPosition === 'inside' ? 'h-6 w-6' : 'h-8 w-8'
                  }
                />
                <div className="sr-only">Close</div>
              </button>
            )}
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  )
}
