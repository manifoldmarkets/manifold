import { Modal } from './layout/modal'
import { Col } from './layout/col'
import { Title } from './widgets/title'
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
        <Title className="!mb-2">Share this post</Title>
        <CopyLinkButton url={shareUrl} tracking="copy share post link" />
        <div className="self-center">
          <TweetButton tweetText={shareUrl} />
        </div>
      </Col>
    </Modal>
  )
}
