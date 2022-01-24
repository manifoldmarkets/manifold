/* This example requires Tailwind CSS v2.0+ */
import { Fragment, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { CheckIcon } from '@heroicons/react/outline'
import { Contract } from '../lib/firebase/contracts'
import { BetPanel } from './bet-panel'

// Inline version of a bet panel. Opens BetPanel in a new modal.
export default function BetRow(props: { contract: Contract }) {
  // Button to open the modal
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        className="flex items-center justify-center w-full h-full p-2 text-white bg-blue-500 hover:bg-blue-700 rounded-lg"
        onClick={() => setOpen(true)}
      >
        Trade
      </button>
      <Modal open={open} setOpen={setOpen}>
        <BetPanel contract={props.contract} title={props.contract.question} />
      </Modal>
    </>
  )
}

export function Modal(props: {
  children: React.ReactNode
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { children, open, setOpen } = props

  return (
    <Transition.Root show={open} as={Fragment}>
      <Dialog
        as="div"
        className="fixed z-10 inset-0 overflow-y-auto"
        onClose={setOpen}
      >
        <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
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
            className="hidden sm:inline-block sm:align-middle sm:h-screen"
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
            <div className="inline-block align-bottom text-left overflow-hidden transform transition-all sm:my-8 sm:align-middle sm:max-w-sm sm:w-full sm:p-6">
              {children}
            </div>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition.Root>
  )
}
