import clsx from 'clsx'
import dayjs from 'dayjs'
import React, { useEffect, useState } from 'react'
import { LinkIcon, SwitchVerticalIcon } from '@heroicons/react/outline'
import toast from 'react-hot-toast'

import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Title } from '../title'
import { User } from 'common/user'
import { Modal } from 'web/components/layout/modal'
import { Button } from '../button'
import { createChallenge, getChallengeUrl } from 'web/lib/firebase/challenges'
import { BinaryContract } from 'common/contract'
import { SiteLink } from 'web/components/site-link'
import { formatMoney } from 'common/util/format'
import { NoLabel, YesLabel } from '../outcome-label'
import { QRCode } from '../qr-code'
import { copyToClipboard } from 'web/lib/util/copy'
import { AmountInput } from '../amount-input'
import { getProbability } from 'common/calculate'
import { track } from 'web/lib/service/analytics'

type challengeInfo = {
  amount: number
  expiresTime: number | null
  message: string
  outcome: 'YES' | 'NO' | number
  acceptorAmount: number
}

export function CreateChallengeModal(props: {
  user: User | null | undefined
  contract: BinaryContract
  isOpen: boolean
  setOpen: (open: boolean) => void
}) {
  const { user, contract, isOpen, setOpen } = props
  const [challengeSlug, setChallengeSlug] = useState('')

  return (
    <Modal open={isOpen} setOpen={setOpen}>
      <Col className="gap-4 rounded-md bg-white px-8 py-6">
        {/*// add a sign up to challenge button?*/}
        {user && (
          <CreateChallengeForm
            user={user}
            contract={contract}
            onCreate={async (newChallenge) => {
              const challenge = await createChallenge({
                creator: user,
                creatorAmount: newChallenge.amount,
                expiresTime: newChallenge.expiresTime,
                message: newChallenge.message,
                acceptorAmount: newChallenge.acceptorAmount,
                outcome: newChallenge.outcome,
                contract: contract,
              })
              if (challenge) {
                setChallengeSlug(getChallengeUrl(challenge))
                track('challenge created', {
                  creator: user.username,
                  amount: newChallenge.amount,
                  contractId: contract.id,
                })
              }
            }}
            challengeSlug={challengeSlug}
          />
        )}
      </Col>
    </Modal>
  )
}

function CreateChallengeForm(props: {
  user: User
  contract: BinaryContract
  onCreate: (m: challengeInfo) => Promise<void>
  challengeSlug: string
}) {
  const { user, onCreate, contract, challengeSlug } = props
  const [isCreating, setIsCreating] = useState(false)
  const [finishedCreating, setFinishedCreating] = useState(false)
  const [error, setError] = useState<string>('')
  const [editingAcceptorAmount, setEditingAcceptorAmount] = useState(false)
  const defaultExpire = 'week'

  const defaultMessage = `${user.name} is challenging you to a bet! Do you think ${contract.question}`

  const [challengeInfo, setChallengeInfo] = useState<challengeInfo>({
    expiresTime: dayjs().add(2, defaultExpire).valueOf(),
    outcome: 'YES',
    amount: 100,
    acceptorAmount: 100,
    message: defaultMessage,
  })
  useEffect(() => {
    setError('')
  }, [challengeInfo])

  return (
    <>
      {!finishedCreating && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (user.balance < challengeInfo.amount) {
              setError('You do not have enough mana to create this challenge')
              return
            }
            setIsCreating(true)
            onCreate(challengeInfo).finally(() => setIsCreating(false))
            setFinishedCreating(true)
          }}
        >
          <Title className="!mt-2" text="Challenge bet " />

          <div className="mb-8">
            Challenge a friend to bet on{' '}
            <span className="underline">{contract.question}</span>
          </div>

          <div className="mt-2 flex flex-col flex-wrap justify-center gap-x-5 gap-y-2">
            <div>You'll bet:</div>
            <Row
              className={
                'form-control w-full max-w-xs items-center justify-between gap-4 pr-3'
              }
            >
              <AmountInput
                amount={challengeInfo.amount || undefined}
                onChange={(newAmount) =>
                  setChallengeInfo((m: challengeInfo) => {
                    return {
                      ...m,
                      amount: newAmount ?? 0,
                      acceptorAmount: editingAcceptorAmount
                        ? m.acceptorAmount
                        : newAmount ?? 0,
                    }
                  })
                }
                error={undefined}
                label={'M$'}
                inputClassName="w-24"
              />
              <span className={''}>on</span>
              {challengeInfo.outcome === 'YES' ? <YesLabel /> : <NoLabel />}
            </Row>
            <Row className={'mt-3 max-w-xs justify-end'}>
              <Button
                color={'gray-white'}
                onClick={() =>
                  setChallengeInfo((m: challengeInfo) => {
                    return {
                      ...m,
                      outcome: m.outcome === 'YES' ? 'NO' : 'YES',
                    }
                  })
                }
              >
                <SwitchVerticalIcon className={'h-6 w-6'} />
              </Button>
            </Row>
            <Row className={'items-center'}>If they bet:</Row>
            <Row className={'max-w-xs items-center justify-between gap-4 pr-3'}>
              <div className={'w-32 sm:mr-1'}>
                <AmountInput
                  amount={challengeInfo.acceptorAmount || undefined}
                  onChange={(newAmount) => {
                    setEditingAcceptorAmount(true)

                    setChallengeInfo((m: challengeInfo) => {
                      return {
                        ...m,
                        acceptorAmount: newAmount ?? 0,
                      }
                    })
                  }}
                  error={undefined}
                  label={'M$'}
                  inputClassName="w-24"
                />
              </div>
              <span>on</span>
              {challengeInfo.outcome === 'YES' ? <NoLabel /> : <YesLabel />}
            </Row>
          </div>
          <Button
            size="2xs"
            color="gray"
            onClick={() => {
              setEditingAcceptorAmount(true)

              const p = getProbability(contract)
              const prob = challengeInfo.outcome === 'YES' ? p : 1 - p
              const { amount } = challengeInfo
              const acceptorAmount = Math.round(amount / prob - amount)
              setChallengeInfo({ ...challengeInfo, acceptorAmount })
            }}
          >
            Use market odds
          </Button>

          <div className="mt-8">
            If the challenge is accepted, whoever is right will earn{' '}
            <span className="font-semibold">
              {formatMoney(
                challengeInfo.acceptorAmount + challengeInfo.amount || 0
              )}
            </span>{' '}
            in total.
          </div>

          <Row className="mt-8 items-center">
            <Button
              type="submit"
              color={'gradient'}
              size="xl"
              className={clsx(
                'whitespace-nowrap drop-shadow-md',
                isCreating ? 'disabled' : ''
              )}
            >
              Create challenge bet
            </Button>
          </Row>
          <Row className={'text-error'}>{error} </Row>
        </form>
      )}
      {finishedCreating && (
        <>
          <Title className="!my-0" text="Challenge Created!" />

          <div>Share the challenge using the link.</div>
          <button
            onClick={() => {
              copyToClipboard(challengeSlug)
              toast('Link copied to clipboard!')
            }}
            className={'btn btn-outline mb-4 whitespace-nowrap normal-case'}
          >
            <LinkIcon className={'mr-2 h-5 w-5'} />
            Copy link
          </button>

          <QRCode url={challengeSlug} className="self-center" />
          <Row className={'gap-1 text-gray-500'}>
            See your other
            <SiteLink className={'underline'} href={'/challenges'}>
              challenges
            </SiteLink>
          </Row>
        </>
      )}
    </>
  )
}
