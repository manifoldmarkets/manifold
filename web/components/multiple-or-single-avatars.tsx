import { Avatar, AvatarSizeType } from 'web/components/widgets/avatar'
import { Col } from 'web/components/layout/col'
import { Row } from './layout/row'
import clsx from 'clsx'
import { UserHovercard } from './user/user-hovercard'
import { buildArray } from 'common/util/array'

export const MultipleOrSingleAvatars = (props: {
  avatars: Array<{ avatarUrl: string; id: string }>
  total?: number
  onClick?: () => void
  size: AvatarSizeType
  // TODO: standardize these numbers so they are calculated from the size
  spacing?: number
  startLeft?: number
  className?: string
}) => {
  const { avatars, total, className, onClick, size } = props
  const combineAvatars = (
    avatars: Array<{ avatarUrl: string; id: string }>
  ) => {
    const totalAvatars = avatars.length
    const maxToShow = Math.min(totalAvatars, 3)
    const avatarsToCombine = avatars.slice(
      totalAvatars - maxToShow,
      totalAvatars
    )
    const max = avatarsToCombine.length
    const startLeft = (props.startLeft ?? 0.1) * (max - 1)
    const spacing = props.spacing ?? 0.3

    const s =
      size == '2xs'
        ? 4
        : size == 'xs'
        ? 6
        : size == 'sm'
        ? 8
        : size == 'md'
        ? 10
        : size == 'lg'
        ? 12
        : size == 'xl'
        ? 24
        : 10
    const sizeInPx = s * 4

    return buildArray(
      avatarsToCombine.map((n, index) => (
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
          <Avatar
            size={size}
            avatarUrl={n.avatarUrl}
            className="outline outline-1 outline-white"
          />
        </div>
      )),
      total && total > maxToShow && (
        <div
          className="bg-primary-400 text-ink-0 flex aspect-square flex-none items-center justify-center rounded-full text-center text-xs outline outline-1 outline-white"
          style={{
            width: `${sizeInPx}px`,
            marginLeft: `${-startLeft + maxToShow * spacing}rem`,
          }}
        >
          +{total - maxToShow}
        </div>
      )
    )
  }
  return (
    <Col
      onClick={onClick}
      className={clsx(`relative cursor-pointer items-center`, className)}
    >
      {avatars.length === 1 ? (
        <UserHovercard userId={avatars[0].id}>
          <Avatar size={size} avatarUrl={avatars[0].avatarUrl} />
        </UserHovercard>
      ) : (
        <Row>{combineAvatars(avatars)}</Row>
      )}
    </Col>
  )
}
