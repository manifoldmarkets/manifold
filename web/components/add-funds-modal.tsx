import { manaToUSD } from 'common/util/format'
import { useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { checkoutURL } from 'web/lib/service/stripe'
import { Button } from './button'
import { Modal } from './layout/modal'
import { FundsSelector } from './yes-no-selector'

export function AddFundsModal(props: {
  open: boolean
  setOpen(open: boolean): void
}) {
  const { open, setOpen } = props

  const user = useUser()

  const [amountSelected, setAmountSelected] = useState<1000 | 2500 | 10000>(
    2500
  )

  return (
    <Modal open={open} setOpen={setOpen} className="rounded-md bg-white p-8">
      <div className="mb-6 text-xl text-indigo-700">Get Mana</div>

      <div className="mb-6 text-gray-700">
        Buy mana (M$) to trade in your favorite markets. <br /> (Not redeemable
        for cash.)
      </div>

      <div className="mb-2 text-sm text-gray-500">Amount</div>
      <FundsSelector selected={amountSelected} onSelect={setAmountSelected} />

      <div className="mt-6">
        <div className="mb-1 text-sm text-gray-500">Price USD</div>
        <div className="text-xl">{manaToUSD(amountSelected)}</div>
      </div>

      <div className="flex">
        <Button color="gray-white" onClick={() => setOpen(false)}>
          Back
        </Button>

        <form
          action={checkoutURL(
            user?.id || '',
            amountSelected,
            window.location.href
          )}
          method="POST"
        >
          <Button type="submit" color="gradient">
            Checkout
          </Button>
        </form>
      </div>
    </Modal>
  )
}
