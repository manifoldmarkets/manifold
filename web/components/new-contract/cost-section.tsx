import { CreateableOutcomeType, Visibility } from 'common/contract'
import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { formatMoney } from 'common/util/format'
import {
  SMALL_UNIQUE_BETTOR_BONUS_AMOUNT,
  UNIQUE_ANSWER_BETTOR_BONUS_AMOUNT,
  UNIQUE_BETTOR_BONUS_AMOUNT,
} from 'common/economy'
import { ENV_CONFIG } from 'common/envs/constants'
import { Button } from 'web/components/buttons/button'
import { AddFundsModal } from 'web/components/add-funds-modal'

export const CostSection = (props: {
  ante: number
  balance: number
  outcomeType: CreateableOutcomeType
  visibility: Visibility
  amountSuppliedByUser: number
  isMulti: boolean
  isPartner: boolean
}) => {
  const {
    ante,
    balance,
    outcomeType,
    visibility,
    amountSuppliedByUser,
    isMulti,
    isPartner,
  } = props
  const [fundsModalOpen, setFundsModalOpen] = useState(false)

  return (
    <Col className="items-start">
      <label className="mb-1 gap-2 px-1 py-2">
        <span>Cost </span>
        <InfoTooltip
          text={
            outcomeType == 'BOUNTIED_QUESTION'
              ? 'Your bounty. This amount is put upfront.'
              : outcomeType == 'POLL'
              ? 'Cost to create your poll.'
              : `Cost to create your question. This amount is used to subsidize predictions.`
          }
        />
      </label>

      <div className="text-ink-700 pl-1 text-sm">
        {amountSuppliedByUser === 0 ? (
          <span className="text-teal-500">FREE </span>
        ) : outcomeType !== 'BOUNTIED_QUESTION' && outcomeType !== 'POLL' ? (
          <>
            {formatMoney(amountSuppliedByUser)}
            {visibility === 'public' && !isPartner && (
              <span>
                {' '}
                or <span className=" text-teal-500">FREE </span>
                if you get{' '}
                {isMulti
                  ? Math.ceil(
                      amountSuppliedByUser / UNIQUE_ANSWER_BETTOR_BONUS_AMOUNT
                    )
                  : amountSuppliedByUser / UNIQUE_BETTOR_BONUS_AMOUNT}
                + participants{' '}
                <InfoTooltip
                  text={
                    isMulti
                      ? `You'll earn a bonus of ${formatMoney(
                          UNIQUE_ANSWER_BETTOR_BONUS_AMOUNT
                        )} for each unique trader you get on each answer.`
                      : `You'll earn a bonus of ${formatMoney(
                          UNIQUE_BETTOR_BONUS_AMOUNT
                        )} for each unique trader you get on your question, up to 50 traders. Then ${formatMoney(
                          SMALL_UNIQUE_BETTOR_BONUS_AMOUNT
                        )} for every unique trader after that.`
                  }
                />
              </span>
            )}
          </>
        ) : (
          <span>
            {amountSuppliedByUser
              ? formatMoney(amountSuppliedByUser)
              : `${ENV_CONFIG.moneyMoniker} --`}
          </span>
        )}
      </div>
      <div className="text-ink-500 pl-1"></div>

      {ante > balance && (
        <div className="mb-2 mr-auto mt-2 self-center whitespace-nowrap text-xs font-medium tracking-wide">
          <span className="text-scarlet-500 mr-2">Insufficient balance</span>
          <Button
            size="xs"
            color="green"
            onClick={() => setFundsModalOpen(true)}
          >
            Get {ENV_CONFIG.moneyMoniker}
          </Button>
          <AddFundsModal open={fundsModalOpen} setOpen={setFundsModalOpen} />
        </div>
      )}
    </Col>
  )
}
