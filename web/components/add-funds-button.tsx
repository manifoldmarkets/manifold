import clsx from 'clsx'
import { useEffect, useState } from 'react'

import { useUser } from 'web/hooks/use-user'
import { checkoutURL } from 'web/lib/service/stripe'
import { FundsSelector } from './yes-no-selector'

export function AddFundsButton(props: { className?: string }) {
  const { className } = props
  const user = useUser()

  const [amountSelected, setAmountSelected] = useState<1000 | 2500 | 10000>(
    2500
  )

  const location = useLocation()

  return (
    <>
      <label
        htmlFor="add-funds"
        className={clsx(
          'btn btn-xs btn-outline modal-button font-normal normal-case',
          className
        )}
      >
        Get M$
      </label>
      <input type="checkbox" id="add-funds" className="modal-toggle" />

      <div className="modal">
        <div className="modal-box">
          <div className="mb-6 text-xl">Get Mana</div>

          <div className="mb-6 text-gray-500">
            Buy mana (M$) to trade in your favorite markets. <br /> (Not
            redeemable for cash.)
          </div>

          <div className="mb-2 text-sm text-gray-500">Amount</div>
          <FundsSelector
            selected={amountSelected}
            onSelect={setAmountSelected}
          />

          <div className="mt-6">
            <div className="mb-1 text-sm text-gray-500">Price USD</div>
            <div className="text-xl">
              ${Math.round(amountSelected / 100)}.00
            </div>
          </div>

          <div className="modal-action">
            <label htmlFor="add-funds" className={clsx('btn btn-ghost')}>
              Back
            </label>

            <form
              action={checkoutURL(user?.id || '', amountSelected, location)}
              method="POST"
            >
              <button
                type="submit"
                className="btn btn-primary bg-gradient-to-r from-indigo-500 to-blue-500 px-10 font-medium hover:from-indigo-600 hover:to-blue-600"
              >
                Checkout
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  )
}

// needed in next js
// window not loaded at runtime
const useLocation = () => {
  const [href, setHref] = useState('')
  useEffect(() => {
    setHref(window.location.href)
  }, [])
  return href
}
