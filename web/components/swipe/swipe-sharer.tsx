import toast from 'react-hot-toast'

import { BinaryContract } from 'common/contract'
import { track } from 'web/lib/service/analytics'
import ArrowUpSquareIcon from '../../lib/icons/arrow-up-square-icon'
import { getIsNative } from '../../lib/native/is-native'
import { postMessageToNative } from '../native-message-listener'
import { NativeShareData } from 'common/native-share-data'
import { getShareUrl } from 'common/util/share'
import { User } from 'common/user'
import { copyToClipboard } from '../../lib/util/copy'

export function SwipeSharer(props: { contract: BinaryContract; user?: User }) {
  const { contract, user } = props

  const isNative = getIsNative()
  const url = getShareUrl(contract, user?.username)

  const onClick = () => {
    if (isNative) {
      postMessageToNative('share', {
        message: url,
      } as NativeShareData)
    } else {
      copyToClipboard(url)
      toast.success('Link copied!')
    }
    track('click swipe share')
  }

  return (
    <button className={'text-ink-0 disabled:opacity-50'} onClick={onClick}>
      <div className="relative">
        <ArrowUpSquareIcon className={'h-12 w-12'} />
      </div>
    </button>
  )
}
