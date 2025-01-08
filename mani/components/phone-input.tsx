import { StyleSheet, View } from 'react-native'
import { Colors } from 'constants/colors'
import PhoneInputLib from 'react-native-phone-input'
import { useRef } from 'react'

export const PhoneInput = ({
  value,
  onChangeText,
}: {
  value: string
  onChangeText: (text: string) => void
}) => {
  const phoneInput = useRef<any>(value)

  const handleChangeText = (text: string) => {
    // Get the formatted phone number with country code
    const formattedNumber = phoneInput.current?.getValue() || text
    onChangeText(formattedNumber)
  }

  return (
    <View style={styles.container}>
      <PhoneInputLib
        ref={phoneInput}
        initialCountry="us"
        textProps={{
          placeholder: '(555) 555-5555',
        }}
        style={styles.input}
        textStyle={styles.inputText}
        flagStyle={styles.flag}
        onChangePhoneNumber={handleChangeText}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 48,
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    height: '100%',
  },
  inputText: {
    color: Colors.text,
    fontSize: 16,
  },
  flag: {
    width: 25,
    height: 15,
    borderWidth: 0,
  },
})
