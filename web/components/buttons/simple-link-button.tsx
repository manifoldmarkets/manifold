import clsx from 'clsx'
import toast from 'react-hot-toast'

import { IconButton } from 'web/components/buttons/button'
import { track } from 'web/lib/service/analytics'
import { Col } from 'web/components/layout/col'
import { Tooltip } from '../widgets/tooltip'
import LinkIcon from 'web/lib/icons/link-icon'
import { copyToClipboard } from 'web/lib/util/copy'

export const SimpleLinkButton = (props: {
  getUrl: () => string
  className?: string
  tooltip: string
}) => {
  const { getUrl, tooltip, className } = props

  return (
    <Tooltip text={tooltip} placement="bottom" noTap noFade>
      <IconButton
        size="2xs"
        onClick={() => {
          copyToClipboard(getUrl())
          toast.success('Link copied!')
          track('copy share link')
        }}
        className={className}
      >
        <Col className={'items-center gap-x-2 sm:flex-row'}>
          <LinkIcon className={clsx('h-5 w-5')} aria-hidden="true" />
        </Col>
      </IconButton>
    </Tooltip>
  )
}
