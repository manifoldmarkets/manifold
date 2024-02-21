import clsx from 'clsx'
import { Answer } from 'common/answer'
import { CPMMMultiContract } from 'common/contract'
import Link from 'next/link'
import { Col } from 'web/components/layout/col'

import { contractPath } from 'common/contract'
import { User } from 'common/user'
import { BuyPanel } from 'web/components/bet/bet-panel'
import { Button } from 'web/components/buttons/button'
import { MODAL_CLASS, Modal } from 'web/components/layout/modal'
import { linkClass } from 'web/components/widgets/site-link'
import { Subtitle } from 'web/components/widgets/subtitle'
import { track } from 'web/lib/service/analytics'
import { useState } from 'react'

export function MatchBetButton(props: {
  contract: CPMMMultiContract
  answer: Answer
  user: User
  modalHeader?: React.ReactNode
  singleBetButton?: boolean
}) {
  const { contract, answer, user, modalHeader, singleBetButton } = props
  const [open, setOpen] = useState(false)
  const [outcome, setOutcome] = useState<'YES' | 'NO' | undefined>(undefined)

  return (
    <>
      {singleBetButton ? (
        <Button
          size={'2xs'}
          color={'indigo'}
          onClick={() => {
            setOpen(true)
            track('love bet button click')
          }}
          disabled={!!answer.resolution}
        >
          Bet
        </Button>
      ) : (
        <>
          <Button
            size="2xs"
            color="green-outline"
            className={'indigo flex-1'}
            onClick={(e) => {
              e.stopPropagation()
              track('love bet button click')
              setOutcome('YES')
              setOpen(true)
            }}
          >
            Yes
          </Button>
          <Button
            size="2xs"
            color="red-outline"
            className={'indigo flex-1'}
            onClick={(e) => {
              e.stopPropagation()
              track('love bet button click')
              setOutcome('NO')
              setOpen(true)
            }}
          >
            No
          </Button>
        </>
      )}
      <Modal
        open={open}
        setOpen={setOpen}
        className={clsx(
          MODAL_CLASS,
          'pointer-events-auto max-h-[40rem] overflow-auto'
        )}
      >
        <Col>
          {modalHeader}
          <Link href={contractPath(contract)}>
            <Subtitle className={clsx('!mb-4 !mt-0 !text-xl', linkClass)}>
              {answer.text}
            </Subtitle>
          </Link>
          <BuyPanel
            contract={contract}
            multiProps={{ answers: contract.answers, answerToBuy: answer }}
            user={user}
            initialOutcome={outcome ?? 'YES'}
            onBuySuccess={() => setTimeout(() => setOpen(false), 500)}
            location={'love profile'}
            inModal={true}
          />
        </Col>
      </Modal>
    </>
  )
}
