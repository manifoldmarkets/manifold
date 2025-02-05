import { Button, ButtonProps } from './button'

const getWidth = (size?: ButtonProps['size']) => {
  return size === 'xs' ? 48 : undefined
}

export function YesNoButton(props: ButtonProps) {
  const isYes = props.variant == 'yes' || props.variant == 'yes-emphasized'
  return (
    <Button
      {...props}
      title={props.title ?? (isYes ? 'Yes' : 'No')}
      style={[{ width: getWidth(props.size) }, props.style]}
      textProps={{
        weight: 'normal',
      }}
    />
  )
}
