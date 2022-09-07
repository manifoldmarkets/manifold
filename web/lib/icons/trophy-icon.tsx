export default function TrophyIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      stroke="currentcolor"
      strokeWidth="2"
      {...props}
    >
      <g>
        <path
          d="m6,5c0,4 1.4,7.8 3.5,8.5l0,2c-1.2,0.7 -1.2,1 -1.6,4l8,0c-0.4,-3 -0.4,-3.3 -1.6,-4l0,-2c2.1,-0.7 3.5,-4.5 3.5,-8.5z"
          strokeLinejoin="round"
          fill="none"
        />
        <path
          d="m6.2,8.3c-2.5,-1.6 -3.5,1 -3,2.5c1,1.7 2.6,2.5 4.5,1.8"
          fill="none"
        />
        <path
          d="m17.6,8.3c2.5,-1.6 3.5,1 3,2.5c-1,1.7 -2.6,2.5 -4.5,1.8"
          fill="none"
        />
      </g>
    </svg>
  )
}
