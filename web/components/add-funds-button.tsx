import clsx from 'clsx'
import { useState } from 'react'

import { useUser } from '../hooks/use-user'
import { checkoutURL } from '../lib/service/stripe'
import { FundsSelector } from './yes-no-selector'

export function AddFundsButton() {
  const user = useUser()

  const [amountSelected, setAmountSelected] = useState<
    500 | 1000 | 2500 | 10000
  >(500)

  return (
    <>
      <label
        htmlFor="add-funds"
        className={clsx('btn btn-sm btn-secondary modal-button')}
      >
        Add funds
      </label>
      <input type="checkbox" id="add-funds" className="modal-toggle" />

      <div className="modal">
        <div className="modal-box">
          <div className="text-lg mb-6">Buy Mantic Dollars</div>

          <div className="text-gray-500 text-sm mb-2">Amount</div>
          <FundsSelector
            selected={amountSelected}
            onSelect={setAmountSelected}
          />

          <div className="mt-6">
            <div className="text-gray-500 text-sm mb-1">Price USD</div>
            <div>${Math.round(amountSelected / 100)}.00</div>
          </div>

          <div className="modal-action">
            <label htmlFor="add-funds" className={clsx('btn btn-ghost')}>
              Back
            </label>

            <form
              action={checkoutURL(user?.id || '', amountSelected)}
              method="POST"
            >
              <button type="submit" className="btn btn-primary">
                Checkout
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  )
}
