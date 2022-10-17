export function QRCode(props: {
  url: string
  className?: string
  width?: number
  height?: number
}) {
  const { url, className, width, height } = {
    width: 200,
    height: 200,
    ...props,
  }

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${width}x${height}&data=${url}`

  return <img src={qrUrl} width={width} height={height} className={className} />
}
