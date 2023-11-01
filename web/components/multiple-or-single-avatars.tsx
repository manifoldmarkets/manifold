import { Avatar, AvatarSizeType } from 'web/components/widgets/avatar'
import { Col } from 'web/components/layout/col'
import { Row } from './layout/row'
import clsx from 'clsx'

export const MultipleOrSingleAvatars = (props: {
  avatarUrls: string[]
  onClick?: () => void
  size: AvatarSizeType
  spacing?: number
  startLeft?: number
  className?: string
}) => {
  const { avatarUrls, className, onClick, size } = props
  const combineAvatars = (avatarUrls: string[]) => {
    const totalAvatars = avatarUrls.length
    const maxToShow = Math.min(totalAvatars, 3)
    const avatarsToCombine = avatarUrls.slice(
      totalAvatars - maxToShow,
      totalAvatars
    )
    const max = avatarsToCombine.length
    const startLeft = (props.startLeft ?? 0.1) * (max - 1)
    const spacing = props.spacing ?? 0.3
    return avatarsToCombine.map((n, index) => (
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
        <Avatar size={size} avatarUrl={n} />
      </div>
    ))
  }
  return (
    <Col
      onClick={onClick}
      className={clsx(`relative cursor-pointer items-center`, className)}
    >
      {avatarUrls.length === 1 ? (
        <Avatar size={size} avatarUrl={avatarUrls[0]} />
      ) : (
        <Row>{combineAvatars(avatarUrls)}</Row>
      )}
    </Col>
  )
}
