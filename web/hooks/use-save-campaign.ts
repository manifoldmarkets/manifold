import { removeNullOrUndefinedProps } from 'common/util/object'
import { useEffect } from 'react'
import { setOnceUserProperty, track } from 'web/lib/service/analytics'

export const useSaveCampaign = () => {
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const campaign = urlParams.get('c')
    if (!campaign) return

    setOnceUserProperty('campaign', campaign)

    const creative = urlParams.get('cr')
    if (creative) {
      setOnceUserProperty('creative', creative)
    }

    track('view campaign', removeNullOrUndefinedProps({ campaign, creative }))
  }, [])
}
