import { SVGProps } from 'react'

export const LogoIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <rect x="1.5" y="1.5" width="21" height="21" rx="5.5" fill="#2563EB" />
    <path
      d="M16.75 5.75H7.25L11.85 12L7.25 18.25H16.75"
      fill="none"
      stroke="white"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)
