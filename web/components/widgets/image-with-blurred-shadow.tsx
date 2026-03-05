import { ReactNode } from 'react'

export default function ImageWithBlurredShadow(props: {
  image: ReactNode
  size?: number // Avatar size in pixels for clipping the blur
}) {
  const { image, size } = props
  return (
    <div className="relative">
      {image}
      {/* Blur only the avatar circle, not decorations that extend beyond */}
      <div
        className="absolute right-0.5 top-0.5 -z-20 overflow-hidden rounded-full blur-sm"
        style={size ? { width: size, height: size } : undefined}
      >
        {image}
      </div>
    </div>
  )
}
