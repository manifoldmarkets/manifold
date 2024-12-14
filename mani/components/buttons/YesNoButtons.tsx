import { Button, ButtonProps } from './Button'

const getWidth = (size?: ButtonProps['size']) => {
  return size === 'xs' ? 44 : undefined
}

export function YesNoButton(props: ButtonProps) {
  const isYes = props.variant == 'yes'
  return (
    <Button
      {...props}
      title={isYes ? 'Yes' : 'No'}
      style={[{ width: getWidth(props.size) }, props.style]}
      textProps={{
        weight: 'normal',
        size: props.size === 'xs' ? 'sm' : 'lg',
      }}
    />
  )
}
