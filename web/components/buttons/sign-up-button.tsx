import { useRouter } from 'next/router'
import clsx from 'clsx'

import { firebaseLogin } from 'web/lib/firebase/users'
import { Button } from './button'
import { PlayMoneyDisclaimer } from '../play-money-disclaimer'
import { Col } from '../layout/col'
import { Row } from 'web/components/layout/row'

export const SidebarSignUpButton = (props: { className?: string }) => {
  const { className } = props
  const router = useRouter()

  return (
    <Col className={clsx('mt-4', className)}>
      <Button
        color="gradient"
        size="xl"
        onClick={async () => {
          // login, and then reload the page, to hit any SSR redirect (e.g.
          // redirecting from / to /home for logged in users)
          await firebaseLogin()
          router.replace(router.asPath)
        }}
        className="w-full"
      >
        Sign up
      </Button>
      <PlayMoneyDisclaimer />
    </Col>
  )
}

export const GoogleSignInButton = (props: { onClick: () => any }) => {
  return (
    <Button
      onClick={props.onClick}
      color={'gradient-pink'}
      size={'lg'}
      className=" whitespace-nowrap  shadow-sm outline-2 "
    >
      <Row className={'items-center gap-2 p-2'}>
        <img
          src="/google.svg"
          alt=""
          width={24}
          height={24}
          className="rounded-full bg-white"
        />
        <span>Sign in with Google</span>
      </Row>
    </Button>
  )
}
