import { Dialog, Transition } from '@headlessui/react';
import clsx from 'clsx';
import { Fragment, ReactNode } from 'react';

// From https://tailwindui.com/components/application-ui/overlays/modals
export function Modal(props: { children: ReactNode; open: boolean; setOpen: (open: boolean) => void; size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  const { children, open, setOpen, size = 'md', className } = props;

  const sizeClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-5xl',
  }[size];

  return (
    <Transition.Root show={open} as={Fragment}>
      <Dialog as="div" className="fixed inset-0 z-50 overflow-hidden" onClose={setOpen}>
        <div className="flex min-h-screen items-end justify-center text-center">
          <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0">
            <Dialog.Overlay className="bg-canvas-500 fixed inset-0 bg-opacity-75 transition-opacity" />
          </Transition.Child>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            enterTo="opacity-100 translate-y-0 sm:scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 translate-y-0 sm:scale-100"
            leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
          >
            <div className={clsx('my-1 mx-4 inline-block w-full transform self-center overflow-visible text-left align-bottom transition-all', sizeClass, className)}>{children}</div>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
