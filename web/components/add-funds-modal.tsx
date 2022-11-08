import { manaToUSD } from 'common/util/format'
import { useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { checkoutURL } from 'web/lib/service/stripe'
import { Button } from './buttons/button'
import { Modal } from './layout/modal'
import { FundsSelector } from './bet/yes-no-selector'
import { PRICES_LIST } from 'web/pages/add-funds'
import { AddFundsIOS } from 'web/components/native/add-funds-ios'
import { getNativePlatform } from 'web/lib/native/is-native'

export function AddFundsModal(props: {
  open: boolean
  setOpen(open: boolean): void
}) {
  const { open, setOpen } = props

  const user = useUser()

  const [amountSelected, setAmountSelected] = useState<number>(2500)
  const { isNative, platform } = getNativePlatform()
  if (isNative && platform === 'ios') {
    return <AddFundsIOS open={open} setOpen={setOpen} />
  }

  return (
    <Modal open={open} setOpen={setOpen} className="rounded-md bg-white p-8">
      <div className="mb-6 text-xl text-indigo-700">Get Mana</div>

      <div className="mb-6 text-gray-700">
        Buy mana (M$) to trade in your favorite markets. <br /> (Not redeemable
        for cash.)
      </div>

      <div className="mb-2 text-sm text-gray-500">Amount</div>
      <FundsSelector
        fundAmounts={PRICES_LIST}
        selected={amountSelected}
        onSelect={setAmountSelected}
      />

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
