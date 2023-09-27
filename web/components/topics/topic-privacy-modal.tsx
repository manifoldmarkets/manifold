import {
  GlobeIcon,
  LockClosedIcon,
  ShieldCheckIcon,
} from '@heroicons/react/solid'
import clsx from 'clsx'
import { PrivacyStatusType } from 'common/group'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Tooltip } from '../widgets/tooltip'

export function PrivacyStatusView(props: {
  viewStatus: PrivacyStatusType
  isSelected: boolean
  size: 'sm' | 'md'
  onClick?: () => void
}) {
  const { viewStatus, isSelected, onClick, size } = props
  const { icon, bigIcon, status, descriptor } = PRIVACY_STATUS_ITEMS[viewStatus]
  return (
    <Col
      className={clsx(
        'cursor-pointer rounded-lg py-2 px-4',
        isSelected
          ? 'from-primary-100 ring-primary-500 bg-gradient-to-br to-transparent ring-2'
          : '',
        size == 'md' ? 'gap-1' : ''
      )}
      onClick={onClick}
    >
      {size == 'md' && (
        <Row className="w-full items-center justify-start gap-1 text-xl">
          {bigIcon}
          {status}
        </Row>
      )}
      {size == 'sm' && (
        <Row className="justify-between">
          <Row className="w-full items-center gap-1 ">
            {icon}
            {status}
          </Row>
          {viewStatus == 'private' && (
            <Tooltip
              text={
                'This feature is still under active development. Please use at your own discretion'
              }
              placement={'top-end'}
            >
              <div className="rounded bg-yellow-200 bg-opacity-60 px-1 text-sm font-semibold text-yellow-800 ">
                BETA
              </div>
            </Tooltip>
          )}
        </Row>
      )}
      <p className="text-ink-700 text-sm">{descriptor}</p>
    </Col>
  )
}

export const PRIVACY_STATUS_ITEMS = {
  public: {
    icon: <GlobeIcon className="h-4 w-4" />,
    bigIcon: <GlobeIcon className="h-6 w-6" />,
    status: 'Public',
    descriptor:
      'Anyone can view, join, and add their own questions to this category.',
  },
  curated: {
    icon: <ShieldCheckIcon className="h-4 w-4" />,
    bigIcon: <ShieldCheckIcon className="h-6 w-6" />,
    status: 'Curated',
    descriptor:
      'Anyone can view and join this category, but only admins and moderators can add/remove questions.',
  },
  private: {
    icon: <LockClosedIcon className="h-4 w-4" />,
    bigIcon: <LockClosedIcon className="h-6 w-6" />,
    status: 'Private',
    descriptor:
      'The content in this category is not viewable by the public. Only approved users can join this category. Manifold devs may view for development reasons.',
  },
}
