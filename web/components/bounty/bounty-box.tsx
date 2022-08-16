import clsx from 'clsx'
import { BountyContract } from 'common/contract'
import { User } from 'common/user'
import { useState } from 'react'
import { addBounty } from 'web/lib/firebase/api'
import { BuyAmountInput } from '../amount-input'
import { Spacer } from '../layout/spacer'
import { Title } from '../title'

export function BountyBox(props: {
  className?: string
  user?: User | null
  contract: BountyContract
}) {
  const { className, user, contract } = props
  const [amount, setAmount] = useState<number | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>()

  const donateDisabled = isSubmitting || !amount || error

  const onSubmit: React.FormEventHandler = async (e) => {
    if (!user || donateDisabled) return

    e.preventDefault()
    setIsSubmitting(true)
    setError(undefined)

    await addBounty({
      amount,
      contractId: contract.id,
    })

    setIsSubmitting(false)
    setAmount(undefined)
  }

  return (
    <div className={clsx(className, 'rounded-lg bg-white py-6 px-8 shadow-lg')}>
      <Title text="Add to bounty" className="!mt-0" />
      <form onSubmit={onSubmit}>
        <label
          className="mb-2 block text-sm text-gray-500"
          htmlFor="donate-input"
        >
          Contribute
        </label>
        <BuyAmountInput
          inputClassName="w-full max-w-none donate-input"
          amount={amount}
          onChange={setAmount}
          error={error}
          setError={setError}
        />

        <Spacer h={8} />

        {user && (
          <button
            type="submit"
            className={clsx(
              'btn w-full',
              donateDisabled ? 'btn-disabled' : 'btn-primary',
              isSubmitting && 'loading'
            )}
          >
            Add to bounty
          </button>
        )}
      </form>
    </div>
  )
}
