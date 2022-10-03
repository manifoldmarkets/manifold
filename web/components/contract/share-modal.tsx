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
import { Button } from '../button'
import { copyToClipboard } from 'web/lib/util/copy'
import { track, withTracking } from 'web/lib/service/analytics'
import { ENV_CONFIG } from 'common/envs/constants'
import { User } from 'common/user'
import { SiteLink } from '../site-link'
import { formatMoney } from 'common/util/format'
import { REFERRAL_AMOUNT } from 'common/economy'
import { CreateChallengeModal } from 'web/components/challenges/create-challenge-modal'
import { useState } from 'react'
import { CHALLENGES_ENABLED } from 'common/challenge'
import ChallengeIcon from 'web/lib/icons/challenge-icon'
import { QRCode } from '../qr-code'

export function ShareModal(props: {
  contract: Contract
  user: User | undefined | null
  isOpen: boolean
  setOpen: (open: boolean) => void
}) {
  const { contract, user, isOpen, setOpen } = props
  const { outcomeType, resolution } = contract

  const [openCreateChallengeModal, setOpenCreateChallengeModal] =
    useState(false)
  const linkIcon = <LinkIcon className="mr-2 h-6 w-6" aria-hidden="true" />
  const showChallenge =
    user && outcomeType === 'BINARY' && !resolution && CHALLENGES_ENABLED

  const shareUrl = `https://${ENV_CONFIG.domain}${contractPath(contract)}${
    user?.username && contract.creatorUsername !== user?.username
      ? '?referrer=' + user?.username
      : ''
  }`

  return (
    <Modal open={isOpen} setOpen={setOpen} size="md">
      <Col className="gap-2.5 rounded  bg-white p-4 sm:gap-4">
        <Title className="!mt-0 !mb-2" text="Share this market" />
        <p>
          Earn{' '}
          <SiteLink href="/referrals">
            {formatMoney(REFERRAL_AMOUNT)} referral bonus
          </SiteLink>{' '}
          if a new user signs up using the link!
        </p>
        <QRCode
          url={shareUrl}
          className="self-center"
          width={150}
          height={150}
        />
        <Button
          size="2xl"
          color="indigo"
          className={'mb-2 flex max-w-xs self-center'}
          onClick={() => {
            copyToClipboard(shareUrl)
            toast.success('Link copied!', {
              icon: linkIcon,
            })
            track('copy share link')
          }}
        >
          {linkIcon} Copy link
        </Button>

        <Row className="z-0 flex-wrap justify-center gap-4 self-center">
          <TweetButton
            className="self-start"
            tweetText={getTweetText(contract, shareUrl)}
          />

          <ShareEmbedButton contract={contract} />

          {showChallenge && (
            <button
              className={
                'btn btn-xs flex-nowrap border-2 !border-indigo-500 !bg-white normal-case text-indigo-500'
              }
              onClick={withTracking(
                () => setOpenCreateChallengeModal(true),
                'click challenge button'
              )}
            >
              ️<ChallengeIcon className="mr-1 h-4 w-4" /> Challenge
              <CreateChallengeModal
                isOpen={openCreateChallengeModal}
                setOpen={(open) => {
                  if (!open) {
                    setOpenCreateChallengeModal(false)
                    setOpen(false)
                  } else setOpenCreateChallengeModal(open)
                }}
                user={user}
                contract={contract}
              />
            </button>
          )}
        </Row>
      </Col>
    </Modal>
  )
}

const getTweetText = (contract: Contract, url: string) => {
  const { question, resolution } = contract
  const tweetDescription = resolution ? `\n\nResolved ${resolution}!` : ''

  return `${question}\n\n${url}${tweetDescription}`
}
