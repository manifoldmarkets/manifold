import { Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react'
import { XIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { ReactNode, useEffect, useRef } from 'react'

export const MODAL_CLASS =
  'items-center gap-4 max-w-full rounded-md bg-canvas-0 sm:px-8 px-4 py-6 text-ink-1000'
export const SCROLLABLE_MODAL_CLASS =
  'max-h-[70vh] min-h-[20rem] !overflow-auto'

// From https://tailwindui.com/components/application-ui/overlays/modals
export function Modal(props: {
  children: ReactNode
  open: boolean
  setOpen?: (open: boolean) => void
  size?: 'sm' | 'md' | 'lg' | 'xl'
  position?: 'center' | 'top' | 'bottom'
  className?: string
  onClose?: () => void
}) {
  const {
    children,
    position = 'center',
    open,
    setOpen,
    size = 'md',
    className,
    onClose,
  } = props

  const sizeClass = {
    sm: 'sm:max-w-sm',
    md: 'sm:max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-5xl',
  }[size]

  const positionClass = {
    center: 'sm:items-center',
    top: 'sm:items-start',
    bottom: '',
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
      // prevent modal from re-opening from bubbled event if Modal is child of the open button
      onClick={(e: any) => e.stopPropagation()}
    >
      <DialogBackdrop
        transition
        className="bg-canvas-100/75 fixed inset-0 transition-opacity data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in"
      />

      <div className="fixed inset-0 z-10 w-screen overflow-y-auto pt-20 sm:p-0">
        <div
          className={clsx(
            'flex min-h-full items-end justify-center overflow-hidden',
            positionClass
          )}
        >
          <DialogPanel
            transition
            className={clsx(
              'transition-opacity data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in',
              'relative lg:mx-6 lg:my-8',
              sizeClass,
              className
            )}
          >
            {children}

            {setOpen && (
              <button
                onClick={() => setOpen(false)}
                className={clsx(
                  'text-ink-700 bottom-50 hover:text-primary-400 focus:text-primary-400 absolute -top-4 right-4 -translate-y-full cursor-pointer outline-none sm:right-0',
                  position === 'top' &&
                    'sm:-bottom-4 sm:top-auto sm:translate-y-full'
                )}
              >
                <XIcon className="h-8 w-8" />
                <div className="sr-only">Close</div>
              </button>
            )}
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  )
}
