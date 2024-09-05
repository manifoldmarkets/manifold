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
  const [isNoRedeemableModalOpen, setIsNoRedeemableModalOpen] = useState(false)

  const canRedeem = redeemableCash > 0 && !blockFromSweepstakes(user)

  const onClick = () => {
    if (canRedeem) {
      router.push('/cashout')
    } else {
      setIsNoRedeemableModalOpen(true)
    }
  }

  const { status, message } = getVerificationStatus(user)
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
      <Modal
        open={isNoRedeemableModalOpen}
        setOpen={setIsNoRedeemableModalOpen}
      >
        <Col className={MODAL_CLASS}>
          {message == USER_NOT_REGISTERED_MESSAGE ||
          message == PHONE_NOT_VERIFIED_MESSAGE ? (
            <Col className="items-center gap-2">
              <RegisterIcon height={40} className="fill-ink-700" />
              <div className="text-2xl">You're not registered yet...</div>
              <p className="text-ink-700 text-sm">
                Registration is required to cash out.
              </p>
              <Link
                href={'/gidx/register'}
                className="bg-primary-500 hover:bg-primary-600 whitespace-nowrap rounded-lg px-4 py-2 text-white"
              >
                Register and get{' '}
                <CoinNumber
                  amount={KYC_VERIFICATION_BONUS}
                  className={'font-bold'}
                  isInline
                />
              </Link>
            </Col>
          ) : message == LOCATION_BLOCKED_MESSAGE ? (
            <Col className="items-center gap-2">
              <LocationBlockedIcon height={40} className="fill-ink-700" />
              <div className="text-2xl">Your location is blocked</div>
              <p className="text-ink-700 text-sm">
                You are unable to cash out at the moment.
              </p>
            </Col>
          ) : message == IDENTIFICATION_FAILED_MESSAGE ||
            message == USER_BLOCKED_MESSAGE ? (
            <Col className="items-center gap-2">
              <RiUserForbidLine className="fill-ink-700 h-40 w-40" />
              <div className="text-2xl">Your registration failed</div>
              <p className="text-ink-700 text-sm">
                You are unable to cash out at the moment.
              </p>
            </Col>
          ) : redeemableCash == 0 ? (
            <Col className="items-center gap-2">
              <div className="text-2xl">
                You don't have any redeemable {SWEEPIES_NAME}
              </div>
              <Row className="w-full">
                <Col className="w-1/2">
                  <div className="text-ink-500 text-xs">
                    Redeemable {SWEEPIES_NAME}
                  </div>
                  <CoinNumber
                    amount={redeemableCash}
                    className={'text-2xl font-bold'}
                    coinType={'sweepies'}
                  />
                </Col>
                <Col className="w-1/2">
                  <div className="text-ink-500 text-xs">
                    Total {SWEEPIES_NAME}
                  </div>
                  <CoinNumber
                    amount={user.cashBalance}
                    className={'text-ink-600 text-2xl font-bold'}
                    coinType={'sweepies'}
                  />
                </Col>
              </Row>
              <p className="text-ink-700 text-sm">
                You can only redeem {SWEEPIES_NAME} that you win trading in a
                market that resolves.
              </p>
            </Col>
          ) : (
            <Col className="items-center gap-2">
              <MdOutlineNotInterested className="fill-ink-700 h-40 w-40" />
              <div className="text-2xl">Cashout unavailable</div>
              <p className="text-ink-700 text-sm">
                You are unable to cash out at the moment.
              </p>
            </Col>
          )}
        </Col>
      </Modal>
    </>
  )
}
