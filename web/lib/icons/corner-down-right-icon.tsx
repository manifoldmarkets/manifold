export default function CornerDownRightIcon(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <polyline points="15 10 20 15 15 20"></polyline>
      <path d="M4 4v7a4 4 0 0 0 4 4h12"></path>
    </svg>
  )
}
