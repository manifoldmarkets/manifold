import { useState } from 'react'
import clsx from 'clsx'

import { LOVE_MARKET_COST } from 'common/love/constants'
import { formatMoney } from 'common/util/format'
import { Button } from 'web/components/buttons/button'
import { MODAL_CLASS, Modal } from 'web/components/layout/modal'
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/firebase/api'
import { Col } from 'web/components/layout/col'
import { Title } from 'web/components/widgets/title'
import { Row } from 'web/components/layout/row'

export const CreateYourMarketButton = ({
  className,
}: {
  className?: string
}) => {
  const user = useUser()
  const [showModal, setShowModal] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const submit = async () => {
    setIsSubmitting(true)
    await api('create-your-love-market', {})
    setShowModal(false)
    setIsSubmitting(false)
  }

  const disabled = !user || user.balance < LOVE_MARKET_COST

  return (
    <>
      <Button
        className={clsx(className, 'font-semibold')}
        color="gradient-pink"
        disabled={isSubmitting}
        onClick={() => setShowModal(true)}
      >
        Create your dating prediction market
      </Button>

      <Modal open={showModal} setOpen={setShowModal}>
        <Col className={clsx(MODAL_CLASS, '!items-start gap-4')}>
          <Title className="!mb-0">Create your dating prediction market</Title>

          <div>
            Incentivize matchmakers to find compatible matches on your behalf.
          </div>

          <Col className="gap-1">
            <div className="text-ink-500 font-semibold">How does it work?</div>
            <div>
              We'll set up a market with the question: "Who will I go on 3 dates
              with?"
            </div>
            <div>
              Everyone you like, likes you, or is shipped with you will appear
              as a potential match.
            </div>
            <div>
              Third party traders can bet mana (our play-money currency) on who
              they think will be the first to go on 3 dates with you.
            </div>
          </Col>

          <Col className="gap-1">
            <div className="text-ink-500 font-semibold">
              How does this help me?
            </div>
            <div>
              You'll get a forecast on how likely each person is to go on 3
              dates with you.
            </div>
            <div>The market will also increase your visibility on the app.</div>
          </Col>

          <Col className="gap-1">
            <div className="text-ink-500 font-semibold">
              Will I need to do anything?
            </div>
            <div>
              There's only one thing you need to do — once you've gone on 3
              dates with someone, you must confirm that within this app.
            </div>
            <div>
              Matchmakers who predicted correctly will then get their payout.
            </div>
          </Col>

          <Row className="w-full items-end justify-between">
            <Button color="gray-white" disabled={disabled} onClick={() => setShowModal(false)}>
              Maybe later
            </Button>

            <Col className="items-center gap-2 self-end">
              <div className="text-ink-500 text-2xl font-semibold">
                Give it a shot:
              </div>

              <Button disabled={disabled} onClick={submit}>
                Pay ${formatMoney(LOVE_MARKET_COST)} & submit
              </Button>
            </Col>
          </Row>
        </Col>
      </Modal>
    </>
  )
}
