import clsx from 'clsx'
import { Row } from '../layout/row'
import { Spacer } from '../layout/spacer'
import { NavButtons } from './NavButtons'
import Link from 'next/link'
import { ENV_CONFIG } from 'common/envs/constants'
import { Button } from '../buttons/button'
import { copyToClipboard } from 'web/lib/util/copy'
import { HomeIcon, LinkIcon } from '@heroicons/react/solid'
import { Col } from '../layout/col'
import { VscDebugRestart } from 'react-icons/vsc'
import toast, { Toaster } from 'react-hot-toast'

export function TheEnd(props: {
  goToPrevPage: () => void
  username: string
  restart: () => void
}) {
  const { goToPrevPage, username, restart } = props
  const url = getWrappedUrl(username)
  return (
    <>
      <Toaster position={'top-center'} containerClassName="!bottom-[70px]" />
      <Col
        className={clsx(
          'animate-fade-in relative mx-auto my-auto max-w-lg items-center'
        )}
      >
        <div className={clsx('px-6 text-2xl')}>The end!</div>
        <Spacer h={4} />
        <Button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (!url) return
            copyToClipboard(url)
            toast.success('Link copied!')
          }}
          disabled={!url}
          className="z-50 hover:text-pink-400 hover:underline"
          color={'none'}
        >
          <Row className="gap-1">
            <LinkIcon className={'h-5 w-5'} aria-hidden="true" />
            Share
          </Row>
        </Button>
        <Button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            restart()
          }}
          disabled={!url}
          className="z-50 hover:text-pink-400 hover:underline"
          color={'none'}
        >
          <Row className="gap-1">
            <VscDebugRestart className={clsx('h-5 w-5')} aria-hidden="true" />
            Restart
          </Row>
        </Button>
        <Link
          onClick={(e) => {
            // e.preventDefault()
            e.stopPropagation()
          }}
          href="/home"
          className="font-md z-50 flex flex-row items-center justify-center gap-1 rounded-md px-4 py-2 text-center text-sm ring-inset transition-colors hover:text-pink-400 hover:underline disabled:cursor-not-allowed"
        >
          <HomeIcon className={clsx('h-5 w-5')} aria-hidden="true" />
          Back to Home
        </Link>
      </Col>
      <NavButtons goToPrevPage={goToPrevPage} />
    </>
  )
}

export const getWrappedUrl = (username: string | undefined) =>
  `https://${ENV_CONFIG.domain}/${username}/wrapped2024`
