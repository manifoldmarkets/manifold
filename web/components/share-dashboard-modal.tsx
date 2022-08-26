import { LinkIcon } from '@heroicons/react/outline'
import toast from 'react-hot-toast'
import { copyToClipboard } from 'web/lib/util/copy'
import { track } from 'web/lib/service/analytics'
import { Modal } from './layout/modal'
import { Col } from './layout/col'
import { Title } from './title'
import { Button } from './button'
import { TweetButton } from './tweet-button'
import { Row } from './layout/row'

export function ShareDashboardModal(props: {
  shareUrl: string
  isOpen: boolean
  setOpen: (open: boolean) => void
}) {
  const { isOpen, setOpen, shareUrl } = props

  const linkIcon = <LinkIcon className="mr-2 h-6 w-6" aria-hidden="true" />

  return (
    <Modal open={isOpen} setOpen={setOpen} size="md">
      <Col className="gap-4 rounded bg-white p-4">
        <Title className="!mt-0 !mb-2" text="Share this dashboard" />
        <Button
          size="2xl"
          color="gradient"
          className={'mb-2 flex max-w-xs self-center'}
          onClick={() => {
            copyToClipboard(shareUrl)
            toast.success('Link copied!', {
              icon: linkIcon,
            })
            track('copy share dashboard link')
          }}
        >
          {linkIcon} Copy link
        </Button>

        <Row className="z-0 justify-start gap-4 self-center">
          <TweetButton className="self-start" tweetText={shareUrl} />
        </Row>
      </Col>
    </Modal>
  )
}
