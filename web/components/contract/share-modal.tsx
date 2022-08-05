import { LinkIcon } from '@heroicons/react/outline'
import toast from 'react-hot-toast'

import { Contract } from 'common/contract'
import { contractPath } from 'web/lib/firebase/contracts'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { ShareEmbedButton } from '../share-embed-button'
import { Title } from '../title'
import { TweetButton } from '../tweet-button'
import { DuplicateContractButton } from '../copy-contract-button'
import { Button } from '../button'
import { copyToClipboard } from 'web/lib/util/copy'
import { track } from 'web/lib/service/analytics'
import { ENV_CONFIG } from 'common/envs/constants'
import { User } from 'common/user'

export function ShareModal(props: {
  contract: Contract
  user: User | undefined | null
  isOpen: boolean
  setOpen: (open: boolean) => void
}) {
  const { contract, user, isOpen, setOpen } = props

  const linkIcon = <LinkIcon className="mr-2 h-6 w-6" aria-hidden="true" />

  const copyPayload = `https://${ENV_CONFIG.domain}${contractPath(contract)}${
    user?.username && contract.creatorUsername !== user?.username
      ? '?referrer=' + user?.username
      : ''
  }`

  return (
    <Modal open={isOpen} setOpen={setOpen}>
      <Col className="gap-4 rounded bg-white p-4">
        <Title className="!mt-0 mb-2" text="Share this market" />

        <Button
          size="2xl"
          color="gradient"
          className={'mb-2 flex max-w-xs self-center'}
          onClick={() => {
            copyToClipboard(copyPayload)
            track('copy share link')
            toast.success('Link copied!', {
              icon: linkIcon,
            })
          }}
        >
          {linkIcon} Copy link
        </Button>

        <Row className="justify-start gap-4 self-center">
          <TweetButton
            className="self-start"
            tweetText={getTweetText(contract)}
          />
          <ShareEmbedButton contract={contract} toastClassName={'-left-20'} />
          <DuplicateContractButton contract={contract} />
        </Row>
      </Col>
    </Modal>
  )
}

const getTweetText = (contract: Contract) => {
  const { question, resolution } = contract

  const tweetDescription = resolution ? `\n\nResolved ${resolution}!` : ''

  const timeParam = `${Date.now()}`.substring(7)
  const url = `https://manifold.markets${contractPath(contract)}?t=${timeParam}`

  return `${question}\n\n${url}${tweetDescription}`
}
