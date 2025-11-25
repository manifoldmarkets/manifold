import { ImgHTMLAttributes } from 'react'

export const TurkeyLogoIcon = (props: ImgHTMLAttributes<HTMLImageElement>) => (
  <img
    src="/logo-turkey.png"
    alt="Manifold"
    width={24}
    height={24}
    {...props}
  />
)
