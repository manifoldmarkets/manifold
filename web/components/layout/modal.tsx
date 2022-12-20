import { Fragment, ReactNode } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import clsx from 'clsx'

export const MODAL_CLASS = 'items-center gap-4 rounded-md bg-white px-8 py-6'
export const SCROLLABLE_MODAL_CLASS = 'max-h-[70vh] min-h-[20rem] overflow-auto'

// From https://tailwindui.com/components/application-ui/overlays/modals
export function Modal(props: {
  children: ReactNode
  open: boolean
  setOpen: (open: boolean) => void
  size?: 'sm' | 'md' | 'lg' | 'xl'
  position?: 'center' | 'top' | 'bottom'
  className?: string
}) {
  const { children, position, open, setOpen, size = 'md', className } = props

  const sizeClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-5xl',
  }[size]

  const positionClass = {
    center: 'items-center',
    top: 'items-start',
    bottom: 'items-end',
  }[position ?? 'bottom']

  return (
    <Transition.Root show={open} as={Fragment}>
      <Dialog
        as="div"
        className="fixed inset-0 z-50 overflow-y-auto"
        onClose={setOpen}
      >
        <div
          className={clsx(
            'flex min-h-screen justify-center px-4 pt-4 pb-20 text-center sm:p-0',
            positionClass
          )}
        >
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <Dialog.Overlay className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
          </Transition.Child>

          {/* This element is to trick the browser into centering the modal contents. */}
          <span
            className="hidden sm:inline-block sm:h-screen sm:align-middle"
            aria-hidden="true"
          >
            &#8203;
          </span>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            enterTo="opacity-100 translate-y-0 sm:scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 translate-y-0 sm:scale-100"
            leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
          >
            <div
              className={clsx(
                'my-8 mx-6 inline-block w-full transform overflow-hidden text-left align-bottom transition-all sm:self-center sm:align-middle',
                sizeClass,
                className
              )}
            >
              {children}
            </div>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition.Root>
  )
}
