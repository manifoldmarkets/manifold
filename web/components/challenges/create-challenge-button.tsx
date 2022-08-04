import clsx from 'clsx'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { DuplicateIcon } from '@heroicons/react/outline'

import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Title } from '../title'
import { User } from 'common/user'
import { Modal } from 'web/components/layout/modal'
import { Button } from '../button'
import { createChallenge, getChallengeUrl } from 'web/lib/firebase/challenges'
import { BinaryContract } from 'common/contract'
import { CopyLinkButton } from 'web/components/copy-link-button'
import { SiteLink } from 'web/components/site-link'
import { formatMoney } from 'common/util/format'
import { Spacer } from '../layout/spacer'
import { NoLabel, YesLabel } from '../outcome-label'
import { QRCode } from '../qr-code'

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
  const [highlightedSlug, setHighlightedSlug] = useState('')

  return (
    <>
      <Modal open={open} setOpen={(newOpen) => setOpen(newOpen)}>
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
                challenge && setHighlightedSlug(getChallengeUrl(challenge))
              }}
              highlightedSlug={highlightedSlug}
            />
          )}
        </Col>
      </Modal>

      <button
        onClick={() => setOpen(true)}
        className="btn btn-outline mb-4 max-w-xs"
      >
        Challenge ️
      </button>
    </>
  )
}

function CreateChallengeForm(props: {
  user: User
  contract: BinaryContract
  onCreate: (m: challengeInfo) => Promise<void>
  highlightedSlug: string
}) {
  const { user, onCreate, contract, highlightedSlug } = props
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
          <div className="mt-2 flex flex-col flex-wrap gap-x-5 gap-y-2">
            {/*<div>Question:</div>*/}
            {/*<div className="mb-4 italic">{contract.question}</div>*/}

            <div>You are betting:</div>
            <Row className={'form-control w-full justify-start gap-4'}>
              <Col>
                <div className="relative">
                  <span className="absolute mx-3 mt-3.5 text-sm text-gray-400">
                    M$
                  </span>
                  <input
                    className="input input-bordered w-40 pl-10"
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
              <Col className={'mt-3 ml-1 text-gray-600'}>on</Col>
              <Col>
                <select
                  className="form-select h-12 rounded-lg border-gray-300"
                  value={challengeInfo.outcome}
                  onChange={(e) =>
                    setChallengeInfo((m: challengeInfo) => {
                      return {
                        ...m,
                        outcome: e.target.value as 'YES' | 'NO',
                      }
                    })
                  }
                >
                  <option value="YES">YES</option>
                  <option value="NO">NO</option>
                </select>
              </Col>
            </Row>
            <Spacer h={2} />
            <Row className={'items-center'}>They will bet:</Row>
            <Row className={'items-center gap-2'}>
              <div className={'ml-1 min-w-[90px]'}>
                {editingAcceptorAmount ? (
                  <Col>
                    <div className="relative">
                      <span className="absolute mx-3 mt-3.5 text-sm text-gray-400">
                        M$
                      </span>
                      <input
                        className="input input-bordered w-40 pl-10"
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
                  <span className="font-bold">
                    {formatMoney(challengeInfo.acceptorAmount)}
                  </span>
                )}
              </div>
              <Row className={'items-center gap-3'}>
                on
                {challengeInfo.outcome === 'YES' ? <NoLabel /> : <YesLabel />}
                {!editingAcceptorAmount && (
                  <Button
                    color={'gray'}
                    onClick={() =>
                      setEditingAcceptorAmount(!editingAcceptorAmount)
                    }
                    className={
                      'flex flex-row gap-2 !bg-transparent py-1 hover:!bg-gray-100'
                    }
                  >
                    Edit
                  </Button>
                )}
              </Row>
            </Row>
          </div>
          <Row className={'justify-end'}>
            <Button
              type="submit"
              color={'indigo'}
              className={clsx(
                'mt-8 whitespace-nowrap drop-shadow-md',
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
          <CopyLinkButton
            url={highlightedSlug}
            buttonClassName="btn-md rounded-l-none"
            displayUrl={
              '...challenges/' + highlightedSlug.split('/challenges/')[1]
            }
            toastClassName={'-left-40 -top-20 mt-1'}
            icon={DuplicateIcon}
          />
          <QRCode url={highlightedSlug} className="self-center" />
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
