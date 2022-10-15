import clsx from 'clsx'
import toast from 'react-hot-toast'

import { IconButton } from 'web/components/buttons/button'
import { Contract } from 'web/lib/firebase/contracts'
import { User } from 'common/user'
import { track } from 'web/lib/service/analytics'
import { Col } from 'web/components/layout/col'
import { Tooltip } from '../widgets/tooltip'
import { getShareUrl } from 'common/util/share'
import LinkIcon from 'web/lib/icons/link-icon'
import { copyToClipboard } from 'web/lib/util/copy'

export const SimpleLinkButton = (props: {
  contract: Contract
  user: User | undefined | null
}) => {
  const { contract, user } = props

  return (
    <Tooltip text="Copy link to market" placement="bottom" noTap noFade>
      <IconButton
        size="2xs"
        onClick={() => {
          copyToClipboard(getShareUrl(contract, user?.username))
          toast.success('Link copied!')
          track('copy share link')
        }}
      >
        <Col className={'items-center gap-x-2 sm:flex-row'}>
          <LinkIcon className={clsx('h-5 w-5')} aria-hidden="true" />
        </Col>
      </IconButton>
    </Tooltip>
  )
}
