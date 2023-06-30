import { ENV_CONFIG } from 'common/envs/constants'
import { InfoTooltip } from '../widgets/info-tooltip'
import { formatMoney } from 'common/util/format'
import {
  BountiedQuestion,
  BountiedQuestionContract,
  Contract,
  NonBet,
} from 'common/contract'
import { ContractComment } from 'common/comment'
import { Button } from '../buttons/button'
import { useState } from 'react'
import { User } from 'common/user'
import { MODAL_CLASS, Modal } from '../layout/modal'
import { Col } from '../layout/col'
import { CollapsibleContent } from '../widgets/collapsible-content'
import { BuyAmountInput } from '../widgets/amount-input'
import { awardBounty } from 'web/lib/firebase/api'
import clsx from 'clsx'
import Lottie from 'react-lottie'
import * as award from '../../public/lottie/award.json'

export function BountyLeft(props: { bountyLeft: number }) {
  const { bountyLeft } = props
  if (!bountyLeft || bountyLeft < 1) {
    return (
      <span>
        No bounty left
        <InfoTooltip
          text={`The creator has already paid out the max amount of bounty.`}
          className="z-50"
          tooltipParams={{ placement: 'bottom-end' }}
        />
      </span>
    )
  }
  return (
    <span>
      <span className="font-semibold text-teal-600 dark:text-teal-400">
        {formatMoney(bountyLeft)}
      </span>{' '}
      bounty left{' '}
      <InfoTooltip
        text={`The bounty that the creator has left to pay out.`}
        className="z-50"
        tooltipParams={{ placement: 'bottom-end' }}
      />
    </span>
  )
}

export function AwardBountyButton(props: {
  contract: BountiedQuestionContract
  comment: ContractComment
  user: User
  disabled: boolean
  buttonClassName?: string
}) {
  const { contract, comment, user, disabled, buttonClassName } = props
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const { bountyLeft } = contract
  const [amount, setAmount] = useState<number | undefined>(bountyLeft)
  if (!user || user.id !== contract.creatorId) {
    return <></>
  }

  async function onAwardBounty() {
    awardBounty({
      contractId: contract.id,
      commentId: comment.id,
      amount: amount,
    }).then((_result) => setOpen(false))
  }
  return (
    <>
      <Button
        className={clsx('py-1 text-xs', buttonClassName)}
        color={'gray-outline'}
        size="xs"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        Award bounty
      </Button>
      <Modal open={open} setOpen={setOpen}>
        <Col className={MODAL_CLASS}>
          <Lottie
            options={{
              loop: true,
              autoplay: true,
              animationData: award,
              rendererSettings: {
                preserveAspectRatio: 'xMidYMid slice',
              },
            }}
            height={200}
            width={200}
            isStopped={false}
            isPaused={false}
            style={{
              color: '#6366f1',
              pointerEvents: 'none',
              background: 'transparent',
            }}
          />
          <span>
            Award <b>{comment.userName}</b> a bounty
          </span>
          <BuyAmountInput
            parentClassName="w-full"
            inputClassName="w-full max-w-none"
            amount={amount}
            onChange={(newAmount) => setAmount(newAmount)}
            error={error}
            setError={setError}
            minimumAmount={1}
            maximumAmount={bountyLeft}
            sliderOptions={{ show: true, wrap: false }}
          />
          <Button
            size="lg"
            className="w-full"
            disabled={!!error}
            onClick={onAwardBounty}
          >
            Award {amount ? formatMoney(amount) : ''}
          </Button>
        </Col>
      </Modal>
    </>
  )
}
