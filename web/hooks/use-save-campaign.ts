import { removeNullOrUndefinedProps } from 'common/util/object'
import { useEffect } from 'react'
import { track } from 'web/lib/service/analytics'

export const useSaveCampaign = () => {
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const campaign = urlParams.get('c')
    if (!campaign) return

    const creative = urlParams.get('cr')

    track('view campaign', removeNullOrUndefinedProps({ campaign, creative }))
  }, [])
}
