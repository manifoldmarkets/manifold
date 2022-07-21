import { User } from 'common/user'
import { Contract } from 'common/contract'
import { Challenge } from 'common/challenge'
import { useEffect, useState } from 'react'
import { SignUpPrompt } from 'web/components/sign-up-prompt'
import { acceptChallenge, APIError } from 'web/lib/firebase/api'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { Title } from 'web/components/title'
import { Row } from 'web/components/layout/row'
import { formatMoney } from 'common/util/format'
import { Button } from 'web/components/button'
import clsx from 'clsx'

export function AcceptChallengeButton(props: {
  user: User | null | undefined
  contract: Contract
  challenge: Challenge
}) {
  const { user, challenge, contract } = props
  const [open, setOpen] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [loading, setLoading] = useState(false)
  const yourProb = 1 - challenge.creatorsOutcomeProb

  useEffect(() => {
    setErrorText('')
  }, [open])

  if (!user) return <SignUpPrompt label={'Sign up to accept this challenge'} />

  const iAcceptChallenge = () => {
    setLoading(true)
    if (user.id === challenge.creatorId) {
      setErrorText('You cannot accept your own challenge!')
      setLoading(false)
      return
    }
    acceptChallenge({
      contractId: contract.id,
      challengeSlug: challenge.slug,
    })
      .then((r) => {
        console.log('accepted challenge. Result:', r)
        setLoading(false)
      })
      .catch((e) => {
        setLoading(false)
        if (e instanceof APIError) {
          setErrorText(e.toString())
        } else {
          console.error(e)
          setErrorText('Error accepting challenge')
        }
      })
  }

  return (
    <>
      <Modal open={open} setOpen={(newOpen) => setOpen(newOpen)} size={'sm'}>
        <Col className="gap-4 rounded-md bg-white px-8 py-6">
          <Col className={'gap-4'}>
            <div className={'flex flex-row justify-start '}>
              <Title text={"So you're in?"} className={'!my-2'} />
            </div>
            <Col className="w-full items-center justify-start gap-2">
              <Row className={'w-full justify-start gap-20'}>
                <span className={'min-w-[4rem] font-bold'}>Cost to you:</span>{' '}
                <span className={'text-red-500'}>
                  {formatMoney(challenge.amount)}
                </span>
              </Row>
              {/*<Row className={'w-full justify-start gap-8'}>*/}
              {/*  <span className={'min-w-[4rem] font-bold'}>Probability:</span>{' '}*/}
              {/*  <span className={'ml-[3px]'}>*/}
              {/*    {' '}*/}
              {/*    {Math.round(yourProb * 100) + '%'}*/}
              {/*  </span>*/}
              {/*</Row>*/}
              <Col className={'w-full items-center justify-start'}>
                <Row className={'w-full justify-start gap-10'}>
                  <span className={'min-w-[4rem] font-bold'}>
                    Potential payout:
                  </span>{' '}
                  <Row className={'items-center justify-center'}>
                    <span className={'text-primary'}>
                      {formatMoney(challenge.amount / yourProb)}
                    </span>
                    {/*<InfoTooltip text={"If you're right"} />*/}
                  </Row>
                </Row>
              </Col>
            </Col>
            <Row className={'mt-4 justify-end gap-4'}>
              <Button
                color={'gray'}
                disabled={loading}
                onClick={() => setOpen(false)}
                className={clsx('whitespace-nowrap')}
              >
                I'm out
              </Button>
              <Button
                color={'indigo'}
                disabled={loading}
                onClick={() => iAcceptChallenge()}
                className={clsx('min-w-[6rem] whitespace-nowrap')}
              >
                I'm in
              </Button>
            </Row>
            <Row>
              <span className={'text-error'}>{errorText}</span>
            </Row>
          </Col>
        </Col>
      </Modal>

      {challenge.creatorId != user.id && (
        <Button
          color={'indigo'}
          size={'xl'}
          onClick={() => setOpen(true)}
          className={clsx('whitespace-nowrap')}
        >
          I accept this challenge
        </Button>
      )}
    </>
  )
}
