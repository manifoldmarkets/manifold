import clsx from 'clsx'
import dayjs from 'dayjs'
import React, { useEffect, useState } from 'react'
import { SwitchVerticalIcon } from '@heroicons/react/outline'

import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Title } from '../widgets/title'
import { User } from 'common/user'
import { Modal } from 'web/components/layout/modal'
import { Button } from '../buttons/button'
import { createChallenge, getChallengeUrl } from 'web/lib/firebase/challenges'
import { BinaryContract, MAX_QUESTION_LENGTH } from 'common/contract'
import { SiteLink } from 'web/components/widgets/site-link'
import { formatMoney } from 'common/util/format'
import { NoLabel, YesLabel } from '../outcome-label'
import { QRCode } from '../widgets/qr-code'
import { AmountInput } from '../widgets/amount-input'
import { getProbability } from 'common/calculate'
import { createMarket } from 'web/lib/firebase/api'
import { removeUndefinedProps } from 'common/util/object'
import { FIXED_ANTE } from 'common/economy'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { track } from 'web/lib/service/analytics'
import { CopyLinkButton } from '../buttons/copy-link-button'
import { ExpandingInput } from '../widgets/expanding-input'

type challengeInfo = {
  amount: number
  expiresTime: number | null
  outcome: 'YES' | 'NO' | number
  acceptorAmount: number
  question: string
}

export function CreateChallengeModal(props: {
  user: User | null | undefined
  isOpen: boolean
  setOpen: (open: boolean) => void
  contract?: BinaryContract
}) {
  const { user, contract, isOpen, setOpen } = props
  const [challengeSlug, setChallengeSlug] = useState('')
  const [loading, setLoading] = useState(false)

  return (
    <Modal open={isOpen} setOpen={setOpen}>
      <Col className="gap-4 rounded-md bg-white px-8 py-6">
        {/*// add a sign up to challenge button?*/}
        {user && (
          <CreateChallengeForm
            user={user}
            contract={contract}
            loading={loading}
            onCreate={async (newChallenge) => {
              setLoading(true)
              try {
                const challengeContract = contract
                  ? contract
                  : await createMarket(
                      removeUndefinedProps({
                        question: newChallenge.question,
                        outcomeType: 'BINARY',
                        initialProb: 50,
                        ante: FIXED_ANTE,
                        closeTime: dayjs().add(30, 'day').valueOf(),
                      })
                    )
                const challenge = await createChallenge({
                  creator: user,
                  creatorAmount: newChallenge.amount,
                  expiresTime: newChallenge.expiresTime,
                  acceptorAmount: newChallenge.acceptorAmount,
                  outcome: newChallenge.outcome,
                  contract: challengeContract as BinaryContract,
                })
                if (challenge) {
                  setChallengeSlug(getChallengeUrl(challenge))
                  track('challenge created', {
                    creator: user.username,
                    amount: newChallenge.amount,
                    contractId: challengeContract.id,
                  })
                }
              } catch (e) {
                console.error("couldn't create market/challenge:", e)
              }
              setLoading(false)
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
  onCreate: (m: challengeInfo) => Promise<void>
  challengeSlug: string
  loading: boolean
  contract?: BinaryContract
}) {
  const { user, onCreate, contract, challengeSlug, loading } = props
  const [isCreating, setIsCreating] = useState(false)
  const [finishedCreating, setFinishedCreating] = useState(false)
  const [error, setError] = useState<string>('')
  const [editingAcceptorAmount, setEditingAcceptorAmount] = useState(false)
  const defaultExpire = 'week'

  const [challengeInfo, setChallengeInfo] = useState<challengeInfo>({
    expiresTime: dayjs().add(2, defaultExpire).valueOf(),
    outcome: 'YES',
    amount: 100,
    acceptorAmount: 100,
    question: contract ? contract.question : '',
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
              setError("You don't have enough mana to create this challenge")
              return
            }
            if (!contract && user.balance < FIXED_ANTE + challengeInfo.amount) {
              setError(
                `You don't have enough mana to create this challenge and market. You need ${formatMoney(
                  FIXED_ANTE + challengeInfo.amount
                )}`
              )
              return
            }
            setIsCreating(true)
            onCreate(challengeInfo).finally(() => setIsCreating(false))
            setFinishedCreating(true)
          }}
        >
          <Title className="!mt-2 hidden sm:block" text="Challenge bet " />

          <div className="mb-8">
            Challenge a friend to bet on{' '}
            {contract ? (
              <span className="underline">{contract.question}</span>
            ) : (
              <ExpandingInput
                placeholder="e.g. Will a Democrat be the next president?"
                className="mt-1 w-full"
                autoFocus={true}
                maxLength={MAX_QUESTION_LENGTH}
                value={challengeInfo.question}
                onChange={(e) =>
                  setChallengeInfo({
                    ...challengeInfo,
                    question: e.target.value,
                  })
                }
              />
            )}
          </div>

          <Col className="mt-2 flex-wrap justify-center gap-x-5 sm:gap-y-2">
            <Col>
              <div>You'll bet:</div>
              <Row
                className={
                  'w-full max-w-xs items-center justify-between gap-4 pr-3'
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
                  label={'Ṁ'}
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
              <Row
                className={'max-w-xs items-center justify-between gap-4 pr-3'}
              >
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
                    label={'Ṁ'}
                    inputClassName="w-24"
                  />
                </div>
                <span>on</span>
                {challengeInfo.outcome === 'YES' ? <NoLabel /> : <YesLabel />}
              </Row>
            </Col>
          </Col>
          {contract && (
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
          )}
          <div className="mt-8">
            If the challenge is accepted, whoever is right will earn{' '}
            <span className="font-semibold">
              {formatMoney(
                challengeInfo.acceptorAmount + challengeInfo.amount || 0
              )}
            </span>{' '}
            in total.{' '}
            <span>
              {!contract && (
                <span>
                  Because there's no market yet, you'll be charged
                  <span className={'mx-1 font-semibold'}>
                    {formatMoney(FIXED_ANTE)}
                  </span>
                  to create it.
                </span>
              )}
            </span>
          </div>

          <Row className="mt-8 items-center">
            <Button
              type="submit"
              color={'gradient'}
              size="xl"
              disabled={isCreating || challengeInfo.question === ''}
              className={clsx('whitespace-nowrap drop-shadow-md')}
            >
              Create challenge bet
            </Button>
          </Row>
          <Row className={'text-error'}>{error} </Row>
        </form>
      )}
      {loading && (
        <Col className={'h-56 w-full items-center justify-center'}>
          <LoadingIndicator />
        </Col>
      )}
      {finishedCreating && !loading && (
        <>
          <Title className="!my-0" text="Challenge Created!" />

          <div>Share the challenge using the link.</div>
          <CopyLinkButton url={challengeSlug} />

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
