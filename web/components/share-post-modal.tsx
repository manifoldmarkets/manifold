import { Modal } from './layout/modal'
import { Col } from './layout/col'
import { Title } from './title'
import { TweetButton } from './tweet-button'
import { Row } from './layout/row'
import { CopyLinkButton } from './copy-link-button'

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

        <Row className="z-0 justify-start gap-4 self-center">
          <TweetButton className="self-start" tweetText={shareUrl} />
        </Row>
      </Col>
    </Modal>
  )
}
