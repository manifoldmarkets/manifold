import clsx from 'clsx'

import { useUser } from '../hooks/use-user'

export function AddFundsButton(props: {}) {
  const {} = props
  const user = useUser()

  return (
    <>
      <label htmlFor="add-funds" className={clsx('btn modal-button')}>
        Add funds
      </label>
      <input type="checkbox" id="add-funds" className="modal-toggle" />

      <div className="modal">
        <div className="modal-box">
          Buy M$500
          <div className="modal-action">
            <label htmlFor="add-funds" className={clsx('btn')}>
              Back
            </label>

            <form action={checkoutURL(user?.id || '', 500)} method="POST">
              <button type="submit" className="btn">
                Checkout
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  )
}

const checkoutURL = (userId: string, manticDollarQuantity: number) => {
  const endpoint =
    'https://us-central1-mantic-markets.cloudfunctions.net/createCheckoutSession'
  return `${endpoint}?userId=${userId}&manticDollarQuantity=${manticDollarQuantity}`
}
