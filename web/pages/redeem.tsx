import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/title'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { Page } from 'web/components/page'
import { useTracking } from 'web/hooks/use-tracking'
import { redirectIfLoggedOut } from 'web/lib/firebase/server-auth'
import { Button } from 'web/components/button'
import { convertmana } from 'web/lib/firebase/api'
import { formatMoney } from 'common/util/format'
import { useEffect, useState } from 'react'
import { Modal } from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { LoadingIndicator } from 'web/components/loading-indicator'

export const getServerSideProps = redirectIfLoggedOut('/')

export default function RedeemManaPage() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const user = useUser()
  const privateUser = usePrivateUser(user?.id)
  useTracking('view redeem mana page')
  const cost = 5000
  useEffect(() => {
    if (open) setSuccess(false)
    setError('')
  }, [open])

  if (!user || !privateUser) return <LoadingIndicator />

  const onClick = async () => {
    if (user.balance < cost) {
      setError('You do not have enough mana to redeem.')
      return
    }
    setLoading(true)
    try {
      await convertmana({})
      setSuccess(true)
    } catch (e) {
      setError((e as any).message)
      setSuccess(false)
    }
    setLoading(false)
  }

  return (
    <Page>
      <SEO
        title="Mana Redemptions"
        description={`Manifold's redemption program. Redeem mana for your gift cards!`}
        url="/redeem"
      />

      <Col className="items-center">
        <Col className="h-full rounded bg-white p-4 py-8 sm:p-8 sm:shadow-md">
          <Title className="!mt-0" text="Redeem your mana" />
          <img
            className="mb-6 block -scale-x-100 self-center"
            src="/logo-flapping-with-money.gif"
            width={200}
            height={200}
          />
          <div className={'mb-4'}>
            For {formatMoney(cost)} you can get a $50 gift card from:
            <Col className={'my-2 w-full items-center justify-center gap-2'}>
              <div> • Amazon</div>
              <div> • Starbucks</div>
              <div> • Best Buy</div>
              <div> • And more!</div>
            </Col>
            You'll get an email with more details upon redemption.
          </div>
          <Button
            color={'indigo'}
            onClick={() => {
              setOpen(!open)
            }}
          >
            {' '}
            Redeem {formatMoney(cost)}
          </Button>
          <Modal
            open={open}
            setOpen={setOpen}
            className={'self-center rounded-md bg-white p-4'}
          >
            <Col>
              {success ? (
                <Col className={'items-center justify-center'}>
                  <div className={'my-4 text-5xl'}>🎉</div>
                  <div className={''}>
                    Thanks! You'll see your gift card in your inbox within the
                    next few minutes!
                  </div>
                </Col>
              ) : (
                <>
                  <Title text={'Are you sure?'} />
                  <Col className={'gap-1'}>
                    <div>
                      You will be charged:{' '}
                      <div className={'mb-2 font-bold text-indigo-700'}>
                        {formatMoney(cost)}
                      </div>
                    </div>
                    <div>
                      A $50 gift card of your choice will be sent to:
                      <div className={'mb-2 font-bold text-indigo-700'}>
                        {privateUser.email}
                      </div>
                    </div>
                    <div>Do you want to continue?</div>
                  </Col>
                  <Row>
                    <span className="text-error">{error}</span>
                  </Row>
                  <Row className={'mt-4 justify-end gap-2'}>
                    <Button color={'indigo'} onClick={onClick}>
                      {loading ? 'Loading...' : 'Confirm'}
                    </Button>
                    <Button color={'gray'} onClick={() => setOpen(false)}>
                      Cancel
                    </Button>
                  </Row>
                </>
              )}
            </Col>
          </Modal>
        </Col>
      </Col>
    </Page>
  )
}
