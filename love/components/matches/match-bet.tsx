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
}) {
  const { contract, answer, user, modalHeader } = props
  const [open, setOpen] = useState(false)
  return (
    <>
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
            initialOutcome="YES"
            onBuySuccess={() => setTimeout(() => setOpen(false), 500)}
            location={'love profile'}
            inModal={true}
          />
        </Col>
      </Modal>
    </>
  )
}
