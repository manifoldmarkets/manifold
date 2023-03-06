import { User } from 'common/user'
import { Contract } from 'common/contract'
import { Challenge } from 'common/challenge'
import { useEffect, useState } from 'react'
import { BetSignUpPrompt } from 'web/components/sign-up-prompt'
import { acceptChallenge, APIError } from 'web/lib/firebase/api'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { Title } from 'web/components/widgets/title'
import { Row } from 'web/components/layout/row'
import { formatMoney } from 'common/util/format'
import { Button } from 'web/components/buttons/button'
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
  const { acceptorAmount, creatorAmount } = challenge

  useEffect(() => {
    setErrorText('')
  }, [open])

  if (!user)
    return <BetSignUpPrompt label="Sign up to accept" className="mt-4" />

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
      outcomeType: contract.outcomeType,
      closeTime: contract.closeTime,
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
        <Col className="bg-canvas-0 gap-4 rounded-md px-8 py-6">
          <Col className={'gap-4'}>
            <div className={'flex flex-row justify-start '}>
              <Title children={"So you're in?"} className={'!my-2'} />
            </div>
            <Col className="w-full items-center justify-start gap-2">
              <Row className={'w-full justify-start gap-20'}>
                <span className={'min-w-[4rem] font-bold'}>Cost to you:</span>{' '}
                <span className={'text-scarlet-500'}>
                  {formatMoney(acceptorAmount)}
                </span>
              </Row>
              <Col className={'w-full items-center justify-start'}>
                <Row className={'w-full justify-start gap-10'}>
                  <span className={'min-w-[4rem] font-bold'}>
                    Potential payout:
                  </span>{' '}
                  <Row className={'items-center justify-center'}>
                    <span className={'text-teal-500'}>
                      {formatMoney(creatorAmount + acceptorAmount)}
                    </span>
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
          color="gradient"
          size="2xl"
          onClick={() => setOpen(true)}
          className={clsx('whitespace-nowrap')}
        >
          Accept bet
        </Button>
      )}
    </>
  )
}
