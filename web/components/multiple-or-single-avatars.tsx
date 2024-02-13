import {
  RawAvatar,
  AvatarSizeType,
  Avatar,
  LoadingAvatar,
  EmptyAvatar,
} from 'web/components/widgets/avatar'
import { Col } from 'web/components/layout/col'
import { Row } from './layout/row'
import clsx from 'clsx'
import { useDisplayUsers } from 'web/hooks/use-user'

type MultipleAvatarProps = {
  userIds: string[]
  onClick?: () => void
  size: AvatarSizeType
  // TODO: standardize these numbers so they are calculated from the size
  spacing?: number
  startLeft?: number
  className?: string
}

export const MultipleOrSingleAvatars = (props: MultipleAvatarProps) => {
  const { userIds, size, className } = props

  if (userIds.length === 0) {
    return <EmptyAvatar className={className} />
  }

  if (userIds.length === 1) {
    return <Avatar userId={userIds[0]} size={size} className={className} />
  }

  return <MultipleAvatars {...props} />
}

const MultipleAvatars = (props: MultipleAvatarProps) => {
  const { userIds, className, onClick, size } = props
  const total = userIds.length
  const maxToShow = Math.min(total, 3)

  const data = useDisplayUsers(userIds.slice(total - maxToShow, total))

  const max = data.length
  const startLeft = (props.startLeft ?? 0.1) * (max - 1)
  const spacing = props.spacing ?? 0.3

  return (
    <Col
      onClick={onClick}
      className={clsx(`relative cursor-pointer items-center`, className)}
    >
      <Row>
        {data.map((user, index) => (
          <div
            key={index}
            style={
              index > 0
                ? {
                    marginLeft: `${-startLeft + index * spacing}rem`,
                  }
                : {}
            }
          >
            {user === 'loading' ? (
              <LoadingAvatar size={size} className={className} />
            ) : user === 'not-found' || user === null ? (
              <LoadingAvatar
                size={size}
                className={clsx('!animate-none', className)}
              />
            ) : (
              <RawAvatar size={size} />
            )}
          </div>
        ))}
      </Row>
    </Col>
  )
}
