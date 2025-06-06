import { Rounded } from 'constants/border-radius'
import { Image, View, ViewProps } from 'react-native'

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg'

export const imageSizeMap = {
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
          width: imageSizeMap[size],
          height: imageSizeMap[size],
          borderRadius: Rounded.full,
        }}
        {...rest}
        src={avatarUrl}
        alt={`${username}`}
      />
    </View>
  )
}
