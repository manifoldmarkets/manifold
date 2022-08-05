import { ENV_CONFIG } from 'common/envs/constants'
import { Contract, contractPath, contractUrl } from 'web/lib/firebase/contracts'
import { CopyLinkButton } from './copy-link-button'

export function ShareMarketButton(props: { contract: Contract }) {
  const { contract } = props

  const url = `https://${ENV_CONFIG.domain}${contractPath(contract)}`

  return (
    <CopyLinkButton
      url={url}
      displayUrl={contractUrl(contract)}
      buttonClassName="btn-md rounded-l-none"
      toastClassName={'-left-28 mt-1'}
    />
  )
}
