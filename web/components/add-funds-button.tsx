import clsx from 'clsx'
import { useState } from 'react'

import { useUser } from '../hooks/use-user'
import { checkoutURL } from '../lib/service/stripe'
import { FundsSelector } from './yes-no-selector'

export function AddFundsButton(props: { className?: string }) {
  const { className } = props
  const user = useUser()

  const [amountSelected, setAmountSelected] = useState<
    500 | 1000 | 2500 | 10000
  >(500)

  return (
    <>
      <label
        htmlFor="add-funds"
        className={clsx(
          'btn btn-xs btn-outline normal-case modal-button font-normal',
          className
        )}
      >
        Add funds
      </label>
      <input type="checkbox" id="add-funds" className="modal-toggle" />

      <div className="modal">
        <div className="modal-box">
          <div className="text-xl mb-6">Get Manifold Dollars</div>

          <div className="text-gray-500 mb-6">
            Use Manifold Dollars to trade in your favorite markets. <br /> (Not
            redeemable for cash.)
          </div>

          <div className="text-gray-500 text-sm mb-2">Amount</div>
          <FundsSelector
            selected={amountSelected}
            onSelect={setAmountSelected}
          />

          <div className="mt-6">
            <div className="text-gray-500 text-sm mb-1">Price USD</div>
            <div className="text-xl">
              ${Math.round(amountSelected / 100)}.00
            </div>
          </div>

          <div className="modal-action">
            <label htmlFor="add-funds" className={clsx('btn btn-ghost')}>
              Back
            </label>

            <form
              action={checkoutURL(
                user?.id || '',
                amountSelected,
                window.location.href
              )}
              method="POST"
            >
              <button
                type="submit"
                className="btn btn-primary px-10 font-medium bg-gradient-to-r from-teal-500 to-green-500 hover:from-teal-600 hover:to-green-600"
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
