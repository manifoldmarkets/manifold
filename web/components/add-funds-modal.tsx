import { manaToUSD } from 'common/util/format'
import { useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { checkoutURL } from 'web/lib/service/stripe'
import { Button } from './buttons/button'
import { Modal } from './layout/modal'
import { FundsSelector } from './bet/yes-no-selector'
import { getNativePlatform } from 'web/lib/native/is-native'
import { OtherWaysToGetMana } from './native/add-funds-ios'
import { Tabs } from './layout/tabs'
import { IOS_PRICES, WEB_PRICES } from 'web/pages/add-funds'
import { postMessageToNative } from 'web/components/native-message-listener'

export function AddFundsModal(props: {
  open: boolean
  setOpen(open: boolean): void
}) {
  const { open, setOpen } = props

  return (
    <Modal open={open} setOpen={setOpen} className="rounded-md bg-white p-8">
      <Tabs
        currentPageForAnalytics="buy modal"
        tabs={[
          {
            title: 'Buy Mana',
            content: <BuyManaTab onClose={() => setOpen(false)} />,
          },
          {
            title: "I'm Broke",
            content: (
              <>
                <div className="mt-6 mb-4">
                  Here are some other ways to get mana:
                </div>
                <OtherWaysToGetMana />
              </>
            ),
          },
        ]}
      />
    </Modal>
  )
}

function BuyManaTab(props: { onClose: () => void }) {
  const { onClose } = props
  const user = useUser()
  const { isNative, platform } = getNativePlatform() ?? {}

  const [amountSelected, setAmountSelected] = useState<number>(2500)
  return (
    <>
      <div className="mt-6 mb-4">
        Buy mana (M$) to trade in your favorite markets.
        <div className="italic">Not redeemable for cash.</div>
      </div>

      <div className="mb-2 text-sm text-gray-500">Amount</div>
      <FundsSelector
        fundAmounts={isNative && platform === 'ios' ? IOS_PRICES : WEB_PRICES}
        selected={amountSelected}
        onSelect={setAmountSelected}
        btnClassName={'max-w-[7rem]'}
      />

      <div className="mt-6">
        <div className="mb-1 text-sm text-gray-500">Price USD</div>
        <div className="text-xl">{manaToUSD(amountSelected)}</div>
      </div>

      <div className="mt-2 flex gap-2">
        <Button color="gray" onClick={onClose}>
          Back
        </Button>

        {isNative && platform === 'ios' ? (
          <Button
            color={'gradient'}
            onClick={() =>
              postMessageToNative('checkout', { amount: amountSelected })
            }
          >
            Checkout
          </Button>
        ) : (
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
        )}
      </div>
    </>
  )
}
