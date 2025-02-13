import { Path, Svg } from 'react-native-svg'

export const Check = ({
  size = 24,
  color = '#000',
}: {
  size?: number
  color?: string
}) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20 6L9 17L4 12"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}
