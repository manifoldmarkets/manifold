import {
  blockFromSweepstakes,
  getVerificationStatus,
  IDENTIFICATION_FAILED_MESSAGE,
  LOCATION_BLOCKED_MESSAGE,
  PHONE_NOT_VERIFIED_MESSAGE,
  User,
  USER_BLOCKED_MESSAGE,
  USER_NOT_REGISTERED_MESSAGE,
} from 'common/user'
import { Button } from '../buttons/button'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useRouter } from 'next/router'
import { CoinNumber } from '../widgets/coin-number'
import { useState } from 'react'
import { Modal, MODAL_CLASS } from '../layout/modal'
import { Col } from '../layout/col'
import Link from 'next/link'
import { Row } from '../layout/row'
import { KYC_VERIFICATION_BONUS } from 'common/economy'
import { RegisterIcon } from 'web/public/custom-components/registerIcon'
import { LocationBlockedIcon } from 'web/public/custom-components/locationBlockedIcon'
import { RiUserForbidLine } from 'react-icons/ri'
import { MdOutlineNotInterested } from 'react-icons/md'
import { SWEEPIES_NAME } from 'common/envs/constants'

export function RedeemSweepsButtons(props: { user: User; className?: string }) {
  const { user, className } = props
  const { data: redeemable } = useAPIGetter('get-redeemable-prize-cash', {})
  const redeemableCash = redeemable?.redeemablePrizeCash ?? 0
  const router = useRouter()

  const canRedeem = redeemableCash > 0 && !blockFromSweepstakes(user)

  const onClick = () => {
    router.push('/cashout')
  }

  return (
    <>
      <Button
        onClick={onClick}
        color={canRedeem ? 'yellow' : 'gray'}
        className={className}
      >
        Cashout
        <CoinNumber
          amount={redeemableCash}
          className={'ml-1'}
          coinType={'sweepies'}
        />
      </Button>
    </>
  )
}
