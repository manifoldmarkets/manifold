import { ENV_CONFIG } from 'common/envs/constants'
import { CopyLinkOrShareButton } from 'web/components/buttons/copy-link-button'
import { useUser } from 'web/hooks/use-user'

export const ShareProfileButton = (props: {
  username: string
  className?: string
}) => {
  const { username, className } = props
  const currentUser = useUser()
  const shareUrl = currentUser
    ? `https://${ENV_CONFIG.loveDomain}/${username}?referrer=${currentUser.username}`
    : `https://${ENV_CONFIG.loveDomain}/${username}`

  return (
    <CopyLinkOrShareButton
      className={className}
      url={shareUrl}
      eventTrackingName="share love profile"
    >
      <div className="ml-2 text-sm">Share</div>
    </CopyLinkOrShareButton>
  )
}
