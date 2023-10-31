export function QRCode(props: {
  url: string
  className?: string
  width?: number
  height?: number
  color?: string
  bgColor?: string
}) {
  const {
    url,
    className,
    width = 200,
    height = 200,
    color = '000000',
    bgColor = 'ffffff',
  } = props

  // url-encode the url
  const urlEncoded = encodeURIComponent(url)

  const qrUrl =
    `https://api.qrserver.com/v1/create-qr-code/` +
    `?size=${width}x${height}&color=${color}&bgcolor=${bgColor}&data=${urlEncoded}`

  return <img src={qrUrl} width={width} height={height} className={className} />
}
