export default function ClosedDoorIcon(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      fill="currentColor"
      className={props.className}
      viewBox="0 0 18 18"
    >
      <rect x="4" y="1" width="10" height="16" rx="1.07" ry="1.07" />
      <circle cx="12.5" cy="9.5" r=".5" />
    </svg>
  )
}
