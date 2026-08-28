import { SVGProps } from 'react'

export const LogoIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 400 400"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <image
      href="/sumcoin-logo.png"
      x="0"
      y="0"
      width="400"
      height="400"
      preserveAspectRatio="xMidYMid meet"
    />
  </svg>
)
