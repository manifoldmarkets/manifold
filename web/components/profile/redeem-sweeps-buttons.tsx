import { blockFromSweepstakes, User } from 'common/user'
import { useRouter } from 'next/router'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { Button } from '../buttons/button'
import { CoinNumber } from '../widgets/coin-number'
import { KYC_VERIFICATION_BONUS_CASH } from 'common/economy'
import { useKYCGiftAmount } from '../twomba/toggle-verify-callout'

export function RedeemSweepsButtons(props: { user: User; className?: string }) {
  const { user, className } = props
  const { data: redeemable } = useAPIGetter('get-redeemable-prize-cash', {})
  const redeemableCash = redeemable?.redeemablePrizeCash ?? 0
  const router = useRouter()

  const canRedeem = redeemableCash > 0 && !blockFromSweepstakes(user)

  const amount = useKYCGiftAmount(user)

  const onClick = () => {
    router.push('/redeem')
  }

  return (
    <>
      {canRedeem ? (
        <Button onClick={onClick} color={'amber'} className={className}>
          Redeem
          <CoinNumber
            amount={redeemableCash}
            className={'ml-1'}
            coinType={'sweepies'}
          />
        </Button>
      ) : (
        <Button onClick={onClick} color={'amber'} className={className}>
          Claim
          {amount == undefined ? (
            <CoinNumber
              amount={KYC_VERIFICATION_BONUS_CASH}
              coinType="CASH"
              className="ml-1"
            />
          ) : (
            <CoinNumber amount={amount} coinType="CASH" className="ml-1" />
          )}
        </Button>
      )}
    </>
  )
}
