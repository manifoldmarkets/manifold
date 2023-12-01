import { Dialog, Transition } from '@headlessui/react'
import clsx from 'clsx'
import { Fragment, ReactNode } from 'react'

// From https://tailwindui.com/components/application-ui/overlays/modals
export function Modal(props: {
  children: ReactNode
  open: boolean
  setOpen: (open: boolean) => void
  size?: 'sm' | 'md' | 'lg' | 'xl'
  position?: 'center' | 'top' | 'bottom' | 'right'
  noAutoFocus?: boolean
  className?: string
}) {
  const {
    children,
    position = 'center',
    open,
    setOpen,
    size = 'md',
    className,
    noAutoFocus,
  } = props

  const sizeClass =
    position === 'right'
      ? 'w-2/3 sm:w-60 h-[100vh]'
      : {
          sm: 'sm:max-w-sm',
          md: 'sm:max-w-md',
          lg: 'max-w-2xl',
          xl: 'max-w-5xl',
        }[size]

  const positionClass = {
    center: 'sm:items-center',
    top: 'sm:items-start',
    bottom: '',
    right: 'justify-end flex-row w-full grow-y', // Add this line
  }[position]

  return (
    <Transition.Root show={open} as={Fragment}>
      <Dialog
        className="text-ink-1000 relative z-50"
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
          {/* background cover */}
          <div className="bg-canvas-100/75 fixed inset-0" />
        </Transition.Child>

        <Transition.Child
          as={Fragment}
          enter="ease-in sm:ease-out duration-150"
          enterFrom="opacity-0 sm:scale-95"
          enterTo="opacity-100 sm:scale-100"
          leave="ease-out sm:ease-in duration-75"
          leaveFrom="opacity-100 sm:scale-100"
          leaveTo="opacity-0 sm:scale-95"
        >
          {/* <div className="fixed inset-0 overflow-y-auto pt-20 sm:p-0"> */}
          <div className="fixed inset-0 overflow-y-auto sm:p-0 ">
            <div
              className={clsx(
                'flex min-h-full items-end justify-center overflow-hidden',
                positionClass
              )}
            >
              <Dialog.Panel
                className={clsx(
                  'w-full transform transition-all sm:mx-6 sm:my-8',
                  sizeClass,
                  className
                )}
              >
                {/* Hack to capture focus b/c headlessui dialog always focuses first element
                    and we don't want it to.
                */}
                {noAutoFocus && <div tabIndex={0} />}
                {children}
              </Dialog.Panel>
            </div>
          </div>
        </Transition.Child>
      </Dialog>
    </Transition.Root>
  )
}
