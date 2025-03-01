import { Image, View } from 'react-native'
import { AvatarSize, imageSizeMap } from 'components/user/avatar-circle'
import craneImage from 'assets/images/crane.png'
import { useColor } from 'hooks/use-color'

export function LogoAvatar({ size }: { size: AvatarSize }) {
  const color = useColor()
  return (
    <View
      style={{
        width: imageSizeMap[size],
        height: imageSizeMap[size],
        borderRadius: imageSizeMap[size] / 2,
        backgroundColor: color.grayButtonBackground,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Image
        source={craneImage}
        style={{
          width: imageSizeMap[size] * 0.9,
          height: imageSizeMap[size] * 0.9,
        }}
      />
    </View>
  )
}
