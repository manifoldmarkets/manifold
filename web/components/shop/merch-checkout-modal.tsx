import { ReactNode } from 'react'
import { Modal } from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'

export function MerchCheckoutModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
  children: ReactNode
  actions: ReactNode
}) {
  const { open, setOpen, children, actions } = props

  return (
    <Modal
      open={open}
      setOpen={setOpen}
      size="md"
      adaptToKeyboard
      // Match the shared modal's adaptive top spacing. Wider dialogs have no
      // top padding, so the form can use the full viewport above the footer.
      className="bg-canvas-0 flex max-h-[calc(var(--modal-viewport-height,100dvh)-var(--modal-top-spacing,5rem))] flex-col rounded-md sm:max-h-[var(--modal-viewport-height,100dvh)]"
    >
      <div className="min-h-0 overflow-y-auto overscroll-contain">
        {children}
      </div>
      <Row className="border-ink-200 shrink-0 justify-end gap-2 border-t px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
        {actions}
      </Row>
    </Modal>
  )
}
