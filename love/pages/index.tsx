import clsx from 'clsx'
import { useState } from 'react'
import { HeartIcon } from '@heroicons/react/solid'

import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Button, outline } from 'web/components/buttons/button'
import { Input } from 'web/components/widgets/input'
import { db } from 'web/lib/supabase/db'

export default function ManifoldLove() {
  return (
    <Page trackPageView={'signed out home page'} hideSidebar hideBottomBar>
      <Col className="mx-auto w-full gap-8 px-4 pt-4 sm:pt-0">
        <Col className="gap-4">
          <Row className="border-scarlet-800 max-w-md items-center gap-2 border-b border-solid p-2">
            <HeartIcon className="text-scarlet-600 h-8 w-8" />
            <HeartIcon className="text-scarlet-600 h-8 w-8" />
            <HeartIcon className="text-scarlet-600 h-8 w-8" />
            <h1 className="mx-auto text-3xl">
              Manifold
              <span className="text-scarlet-600 font-semibold">.love</span>
            </h1>
            <HeartIcon className="text-scarlet-600 h-8 w-8" />
            <HeartIcon className="text-scarlet-600 h-8 w-8" />
            <HeartIcon className="text-scarlet-600 h-8 w-8" />
          </Row>

          <div className="mt-2" />

          <Row className="justify-between rounded-lg px-3">
            <Col className="max-w-2xl gap-2">
              <h1 className="mb-6 text-3xl">Find your long-term match</h1>
              <h1 className="text-lg leading-10">
                Sign up to see{' '}
                <span className="text-scarlet-700 font-semibold">
                  your matches
                </span>
                ,
                <br /> ranked by odds of a{' '}
                <span className="text-scarlet-700 font-semibold">
                  6-month relationship
                </span>
                ,
                <br /> through a nerdy{' '}
                <span className="text-scarlet-700 font-semibold">
                  prediction market
                </span>
                ,
                <br /> bet on by{' '}
                <span className="text-scarlet-700 font-semibold">
                  your friends
                </span>
                !
              </h1>

              <div className="mt-2" />

              <EmailForm />
            </Col>
            <Col className="hidden sm:flex">
              <img src="/welcome/manipurple.png" width={210} />
            </Col>
          </Row>
        </Col>
      </Col>
    </Page>
  )
}

function EmailForm() {
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [didSubmit, setDidSubmit] = useState(false)

  const submit = async () => {
    setIsSubmitting(true)
    setDidSubmit(false)
    console.log('adding email to waitlist', email)
    await db.from('love_waitlist').insert({ email })
    setIsSubmitting(false)
    setDidSubmit(true)
  }

  return (
    <Col className="rounded-lg py-4">
      <h1 className="mb-4 text-xl">Get notified when we launch</h1>
      <Row className="gap-2">
        <Input
          className="text-ink-1000 invalid:text-ink-1000"
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button
          className={clsx(
            'text-scarlet-700 hover:bg-scarlet-700 whitespace-nowrap',
            outline
          )}
          color="none"
          size="sm"
          disabled={isSubmitting}
          onClick={submit}
        >
          Notify me
        </Button>
      </Row>
      {didSubmit && (
        <div className="text-ink-600 mt-2 text-sm">
          Thanks! We'll email you when we launch.
        </div>
      )}
    </Col>
  )
}
