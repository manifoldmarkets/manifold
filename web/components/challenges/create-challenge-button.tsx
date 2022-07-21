import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Title } from '../title'
import { User } from 'common/user'
import { Modal } from 'web/components/layout/modal'
import dayjs from 'dayjs'
import { Button } from '../button'
import { DuplicateIcon } from '@heroicons/react/outline'
import { createChallenge, getChallengeUrl } from 'web/lib/firebase/challenges'
import { Contract } from 'common/contract'
import { CopyLinkButton } from 'web/components/copy-link-button'
import { getOutcomeProbability } from 'common/calculate'
import { SiteLink } from 'web/components/site-link'

type challengeInfo = {
  amount: number
  expiresTime: number | null
  message: string
  outcome: 'YES' | 'NO' | number
  prob: number
}
export function CreateChallengeButton(props: {
  user: User | null | undefined
  contract: Contract
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
                  amount: newChallenge.amount,
                  expiresTime: newChallenge.expiresTime,
                  message: newChallenge.message,
                  prob: newChallenge.prob / 100,
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

      <Button
        color={'indigo'}
        size={'lg'}
        onClick={() => setOpen(true)}
        className={clsx('whitespace-nowrap')}
      >
        Challenge
      </Button>
    </>
  )
}

function CreateChallengeForm(props: {
  user: User
  contract: Contract
  onCreate: (m: challengeInfo) => Promise<void>
  highlightedSlug: string
}) {
  const { user, onCreate, contract, highlightedSlug } = props
  const [isCreating, setIsCreating] = useState(false)
  const [finishedCreating, setFinishedCreating] = useState(false)
  const [error, setError] = useState<string>('')
  const defaultExpire = 'week'
  const isBinary = contract.outcomeType === 'BINARY'
  const isNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'

  const defaultMessage = `${user.name} is challenging you to a bet! Do you think ${contract.question}`

  const [challengeInfo, setChallengeInfo] = useState<challengeInfo>({
    expiresTime: dayjs().add(2, defaultExpire).valueOf(),
    outcome: 'YES',
    amount: 100,
    prob: Math.round(getOutcomeProbability(contract, 'YES') * 100),
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
          <Title className="!my-2" text="Create a challenge bet" />
          <Row className="label ">You're betting</Row>
          <div className="flex flex-col flex-wrap gap-x-5 gap-y-2">
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
                        return { ...m, amount: parseInt(e.target.value) }
                      })
                    }
                  />
                </div>
              </Col>
              <Col className={'mt-3 ml-1 text-gray-600'}>on</Col>
              <Col>
                {/*<label className="label">Outcome</label>*/}
                {isBinary && (
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
                    <option value="YES">Yes</option>
                    <option value="NO">No</option>
                  </select>
                )}
                {isNumeric && (
                  <div className="relative">
                    <input
                      className="input input-bordered w-full"
                      type="number"
                      min={contract.min}
                      max={contract.max}
                      value={challengeInfo.outcome}
                      onChange={(e) =>
                        setChallengeInfo((m: challengeInfo) => {
                          return {
                            ...m,
                            outcome: parseFloat(e.target.value) as number,
                          }
                        })
                      }
                    />
                  </div>
                )}
              </Col>
            </Row>
            <div className="form-control flex flex-row gap-8">
              {/*<Col className={'mt-9 justify-center'}>at</Col>*/}
              <Col>
                <label className="label ">At</label>
                <div className="relative">
                  <input
                    className="input input-bordered max-w-[5rem]"
                    type="number"
                    min={1}
                    max={100}
                    value={challengeInfo.prob}
                    onChange={(e) =>
                      setChallengeInfo((m: challengeInfo) => {
                        return {
                          ...m,
                          prob: parseFloat(e.target.value),
                        }
                      })
                    }
                  />
                  <span className="absolute top-3.5 -right-5 text-sm text-gray-600">
                    %
                  </span>
                </div>
              </Col>
            </div>

            {/*<div className="form-control w-full">*/}
            {/*  <label className="label">Message</label>*/}
            {/*  <Textarea*/}
            {/*    placeholder={defaultMessage}*/}
            {/*    className="input input-bordered resize-none"*/}
            {/*    autoFocus*/}
            {/*    value={*/}
            {/*      challengeInfo.message !== defaultMessage*/}
            {/*        ? challengeInfo.message*/}
            {/*        : ''*/}
            {/*    }*/}
            {/*    rows={2}*/}
            {/*    onChange={(e) =>*/}
            {/*      setChallengeInfo((m: challengeInfo) => {*/}
            {/*        return { ...m, message: e.target.value }*/}
            {/*      })*/}
            {/*    }*/}
            {/*  />*/}
            {/*</div>*/}
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
              Create
            </Button>
          </Row>
          <Row className={'text-error'}>{error} </Row>
        </form>
      )}
      {finishedCreating && (
        <>
          <Title className="!my-0" text="Challenge Created!" />

          <CopyLinkButton
            url={highlightedSlug}
            buttonClassName="btn-md rounded-l-none"
            displayUrl={
              '...challenges/' + highlightedSlug.split('/challenges/')[1]
            }
            toastClassName={'-left-40 -top-20 mt-1'}
            icon={DuplicateIcon}
          />
          <Row className={'gap-1'}>
            See your other
            <SiteLink className={'font-bold'} href={'/challenges'}>
              challenges
            </SiteLink>
          </Row>
        </>
      )}
    </>
  )
}
