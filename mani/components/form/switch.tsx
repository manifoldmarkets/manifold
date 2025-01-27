import { Switch as RNSwitch, SwitchProps } from 'react-native'
import { useColor } from 'hooks/use-color'

export function Switch(props: SwitchProps) {
  const color = useColor()
  return (
    <RNSwitch
      trackColor={{ false: color.backgroundSecondary, true: color.primary }}
      thumbColor={props.value ? color.background : color.text}
      ios_backgroundColor={color.backgroundSecondary}
      {...props}
    />
  )
}
