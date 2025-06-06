import { TextProps, Text as RNText } from 'react-native'

// Must use this component for text, setting the font on the Parent view didn't work
export const Text = (props: TextProps) => {
  return (
    <RNText
      {...props}
      style={[
        { fontFamily: 'ReadexPro_400Regular', color: 'white' },
        props.style,
      ]}
    />
  )
}
