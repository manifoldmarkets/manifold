import clsx from 'clsx'
import dayjs from 'dayjs'
import React, { useEffect, useState } from 'react'
import { LinkIcon, SwitchVerticalIcon } from '@heroicons/react/outline'

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
import toast from 'react-hot-toast'

type challengeInfo = {
  amount: number
  expiresTime: number | null
  message: string
  outcome: 'YES' | 'NO' | number
  acceptorAmount: number
}
export function CreateChallengeButton(props: {
  user: User | null | undefined
  contract: BinaryContract
}) {
  const { user, contract } = props
  const [open, setOpen] = useState(false)
  const [challengeSlug, setChallengeSlug] = useState('')

  return (
    <>
      <Modal open={open} setOpen={(newOpen) => setOpen(newOpen)} size={'sm'}>
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
                challenge && setChallengeSlug(getChallengeUrl(challenge))
              }}
              challengeSlug={challengeSlug}
            />
          )}
        </Col>
      </Modal>

      <button
        onClick={() => setOpen(true)}
        className="btn btn-outline mb-4 max-w-xs whitespace-nowrap normal-case"
      >
        Challenge a friend
      </button>
    </>
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
          <Title className="!mt-2" text="Challenge a friend to bet " />
          <div className="mt-2 flex flex-col flex-wrap justify-center gap-x-5 gap-y-2">
            <div>You'll bet:</div>
            <Row
              className={
                'form-control w-full max-w-xs items-center justify-between gap-4 pr-3'
              }
            >
              <Col>
                <div className="relative">
                  <span className="absolute mx-3 mt-3.5 text-sm text-gray-400">
                    M$
                  </span>
                  <input
                    className="input input-bordered w-32 pl-10"
                    type="number"
                    min={1}
                    value={challengeInfo.amount}
                    onChange={(e) =>
                      setChallengeInfo((m: challengeInfo) => {
                        return {
                          ...m,
                          amount: parseInt(e.target.value),
                          acceptorAmount: editingAcceptorAmount
                            ? m.acceptorAmount
                            : parseInt(e.target.value),
                        }
                      })
                    }
                  />
                </div>
              </Col>
              <span className={''}>on</span>
              {challengeInfo.outcome === 'YES' ? <YesLabel /> : <NoLabel />}
            </Row>
            <Row className={'mt-3 max-w-xs justify-end'}>
              <Button
                color={'gradient'}
                className={'opacity-80'}
                onClick={() =>
                  setChallengeInfo((m: challengeInfo) => {
                    return {
                      ...m,
                      outcome: m.outcome === 'YES' ? 'NO' : 'YES',
                    }
                  })
                }
              >
                <SwitchVerticalIcon className={'h-4 w-4'} />
              </Button>
            </Row>
            <Row className={'items-center'}>If they bet:</Row>
            <Row className={'max-w-xs items-center justify-between gap-4 pr-3'}>
              <div className={'w-32 sm:mr-1'}>
                {editingAcceptorAmount ? (
                  <Col>
                    <div className="relative">
                      <span className="absolute mx-3 mt-3.5 text-sm text-gray-400">
                        M$
                      </span>
                      <input
                        className="input input-bordered w-32 pl-10"
                        type="number"
                        min={1}
                        value={challengeInfo.acceptorAmount}
                        onChange={(e) =>
                          setChallengeInfo((m: challengeInfo) => {
                            return {
                              ...m,
                              acceptorAmount: parseInt(e.target.value),
                            }
                          })
                        }
                      />
                    </div>
                  </Col>
                ) : (
                  <span className="ml-1 font-bold">
                    {formatMoney(challengeInfo.acceptorAmount)}
                  </span>
                )}
              </div>
              <span>on</span>
              {challengeInfo.outcome === 'YES' ? <NoLabel /> : <YesLabel />}
            </Row>
          </div>
          <Row
            className={clsx(
              'mt-8',
              !editingAcceptorAmount ? 'justify-between' : 'justify-end'
            )}
          >
            {!editingAcceptorAmount && (
              <Button
                color={'gray-white'}
                onClick={() => setEditingAcceptorAmount(!editingAcceptorAmount)}
              >
                Edit
              </Button>
            )}
            <Button
              type="submit"
              color={'indigo'}
              className={clsx(
                'whitespace-nowrap drop-shadow-md',
                isCreating ? 'disabled' : ''
              )}
            >
              Continue
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
