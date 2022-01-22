import { ArrowCircleLeftIcon } from '@heroicons/react/outline'
import { Fold } from '../../common/fold'
import { foldPath } from '../lib/firebase/folds'
import { SiteLink } from './site-link'

export function FoldBack(props: { fold: Fold }) {
  const { fold } = props
  return (
    <SiteLink href={foldPath(fold)}>
      <ArrowCircleLeftIcon className="h-5 w-5 text-gray-500 inline mr-1" />{' '}
      {fold.name}
    </SiteLink>
  )
}
