import { useEffect } from 'react'
import { setUserProperty } from 'web/lib/service/analytics'

export const useSaveCampaign = () => {
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const campaign = urlParams.get('c')
    if (!campaign) return

    setUserProperty('campaign', campaign)
  }, [])
}
