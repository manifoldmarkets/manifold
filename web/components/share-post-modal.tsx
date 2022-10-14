import { Modal } from './layout/modal'
import { Col } from './layout/col'
import { Title } from './title'
import { TweetButton } from './buttons/tweet-button'
import { CopyLinkButton } from './buttons/copy-link-button'

export function SharePostModal(props: {
  shareUrl: string
  isOpen: boolean
  setOpen: (open: boolean) => void
}) {
  const { isOpen, setOpen, shareUrl } = props

  return (
    <Modal open={isOpen} setOpen={setOpen} size="md">
      <Col className="gap-4 rounded bg-white p-4">
        <Title className="!mt-0 !mb-2" text="Share this post" />
        <CopyLinkButton url={shareUrl} tracking="copy share post link" />
        <div className="self-center">
          <TweetButton tweetText={shareUrl} />
        </div>
      </Col>
    </Modal>
  )
}
