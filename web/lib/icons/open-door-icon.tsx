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
      <path d="M13.5,1H4.38c-.23,0-.38,.17-.38,.48V12.19c0,.46,.34,1.04,.75,1.31l5.5,3.5c.41,.27,.75,.11,.75-.35V5.94c0-.46-.34-1.04-.75-1.31L6.12,2h6.88V13.5c0,.28,.22,.5,.5,.5s.5-.22,.5-.5V1.5c0-.28-.22-.5-.5-.5Zm-4,9c.28,0,.5,.22,.5,.5s-.22,.5-.5,.5-.5-.22-.5-.5,.22-.5,.5-.5Z" />
      <circle cx="9.5" cy="10.5" r=".5" />
    </svg>
  )
}
