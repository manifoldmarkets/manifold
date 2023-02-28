import { Dialog, Transition } from '@headlessui/react'
import clsx from 'clsx'
import { Fragment, ReactNode } from 'react'

export const MODAL_CLASS =
  'items-center gap-4 rounded-md bg-canvas-0 px-8 py-6 text-ink-1000'
export const SCROLLABLE_MODAL_CLASS =
  'max-h-[70vh] min-h-[20rem] !overflow-auto'

// From https://tailwindui.com/components/application-ui/overlays/modals
export function Modal(props: {
  children: ReactNode
  open: boolean
  setOpen: (open: boolean) => void
  size?: 'sm' | 'md' | 'lg' | 'xl'
  position?: 'center' | 'top' | 'bottom'
  className?: string
}) {
  const {
    children,
    position = 'center',
    open,
    setOpen,
    size = 'md',
    className,
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

  return (
    <Transition.Root show={open} as={Fragment}>
      <Dialog
        className="relative z-50"
        onClose={setOpen}
        // prevent modal from re-opening from bubbled event if Modal is child of the open button
        onClick={(e: any) => e.stopPropagation()}
      >
        <Transition.Child
          as={Fragment}
          enter="ease-linear duration-150"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-linear duration-75"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="bg-ink-500 fixed inset-0 bg-opacity-75 transition-opacity" />
        </Transition.Child>

        <Transition.Child
          as={Fragment}
          enter="ease-in sm:ease-out duration-150"
          enterFrom="sm:opacity-0 translate-y-full sm:translate-y-0 sm:scale-95"
          enterTo="opacity-100 translate-y-0 sm:scale-100"
          leave="ease-out sm:ease-in duration-75"
          leaveFrom="opacity-100 translate-y-0 sm:scale-100"
          leaveTo="sm:opacity-0 translate-y-full sm:translate-y-0 sm:scale-95"
        >
          <div className="fixed inset-0 overflow-y-auto pt-20 sm:p-0">
            <div
              className={clsx(
                'flex min-h-full items-end justify-center overflow-hidden',
                positionClass
              )}
            >
              <Dialog.Panel
                className={clsx(
                  'w-full transform transition-all sm:my-8 sm:mx-6',
                  sizeClass,
                  className
                )}
              >
                {children}
              </Dialog.Panel>
            </div>
          </div>
        </Transition.Child>
      </Dialog>
    </Transition.Root>
  )
}
