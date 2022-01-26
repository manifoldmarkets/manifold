/* This example requires Tailwind CSS v2.0+ */
import { Fragment, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { Contract } from '../lib/firebase/contracts'
import { BetPanel } from './bet-panel'
import { Row } from './layout/row'
import { YesNoSelector } from './yes-no-selector'

// Inline version of a bet panel. Opens BetPanel in a new modal.
export default function BetRow(props: { contract: Contract }) {
  const [open, setOpen] = useState(false)
  const [betChoice, setBetChoice] = useState<'YES' | 'NO' | undefined>(
    undefined
  )

  return (
    <>
      <div className="-mt-2 text-xl -mx-4">
        <Row className="items-center gap-2 justify-center">
          Buy
          <YesNoSelector
            className="w-72"
            onSelect={(choice) => {
              setOpen(true)
              setBetChoice(choice)
            }}
          />
        </Row>
        <Modal open={open} setOpen={setOpen}>
          <BetPanel
            contract={props.contract}
            title={props.contract.question}
            selected={betChoice}
          />
        </Modal>
      </div>
    </>
  )
}

// From https://tailwindui.com/components/application-ui/overlays/modals
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
            <div className="inline-block align-bottom text-left overflow-hidden transform transition-all sm:my-8 sm:align-middle sm:max-w-md sm:w-full sm:p-6">
              {children}
            </div>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition.Root>
  )
}
