import { Colors } from 'constants/colors'
import { TextInput, TextInputProps } from 'react-native'

export const Input = (props: TextInputProps) => {
  const { style, ...rest } = props
  return (
    <TextInput
      placeholderTextColor={Colors.textTertiary}
      style={[
        {
          borderWidth: 1,
          borderColor: Colors.borderSecondary,
          backgroundColor: Colors.backgroundSecondary,
          borderRadius: 8,
          textAlign: 'left',
          color: Colors.text,
          padding: 10,
          fontSize: 16,
        },
        style,
      ]}
      {...rest}
    />
  )
}
