export function Spacer(props: { w?: number; h?: number }) {
  const { w, h } = props

  const width = w === undefined ? undefined : w * 0.25 + 'rem'
  const height = h === undefined ? undefined : h * 0.25 + 'rem'

  return <div style={{ width, height, flexShrink: 0 }} />
}
