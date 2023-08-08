export default function HorizontalArrows(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M18 8L22 12L18 16" />
      <path d="M6 8L2 12L6 16" />
      <path d="M22 12L12 12L2 12" />
    </svg>
  )
}
