import clsx from 'clsx'
import { Fragment, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'

import { BetPanel } from './bet-panel'
import { Row } from './layout/row'
import { YesNoSelector } from './yes-no-selector'
import { Binary, CPMM, DPM, FullContract } from '../../common/contract'

// Inline version of a bet panel. Opens BetPanel in a new modal.
export default function BetRow(props: {
  contract: FullContract<DPM | CPMM, Binary>
  className?: string
  labelClassName?: string
}) {
  const { className, labelClassName } = props
  const [open, setOpen] = useState(false)
  const [betChoice, setBetChoice] = useState<'YES' | 'NO' | undefined>(
    undefined
  )

  return (
    <>
      <div className={className}>
        <Row className="items-center justify-end gap-2">
          <div className={clsx('mr-2 text-gray-400', labelClassName)}>
            Place a trade
          </div>
          <YesNoSelector
            btnClassName="btn-sm w-20"
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
            onBetSuccess={() => setOpen(false)}
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
        className="fixed inset-0 z-50 overflow-y-auto"
        onClose={setOpen}
      >
        <div className="flex min-h-screen items-end justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
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
            <div className="inline-block transform overflow-hidden text-left align-bottom transition-all sm:my-8 sm:w-full sm:max-w-md sm:p-6 sm:align-middle">
              {children}
            </div>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition.Root>
  )
}
