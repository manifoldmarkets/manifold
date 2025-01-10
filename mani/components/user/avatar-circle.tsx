import { Rounded } from 'constants/border-radius'
import { Image, View, ViewProps } from 'react-native'

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg'

const sizeMap = {
  xs: 20,
  sm: 24,
  md: 32,
  lg: 40,
}

export type AvatarCircleProps = ViewProps & {
  avatarUrl?: string
  username: string
  size?: AvatarSize
}

export function AvatarCircle({
  avatarUrl,
  username,
  size = 'sm',
  style,
  ...rest
}: AvatarCircleProps) {
  return (
    <View style={style}>
      <Image
        style={{
          width: sizeMap[size],
          height: sizeMap[size],
          borderRadius: Rounded.full,
        }}
        {...rest}
        src={avatarUrl}
        alt={`${username}`}
      />
    </View>
  )
}
