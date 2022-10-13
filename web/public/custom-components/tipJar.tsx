export default function TipJar({
  size = 18,
  color = '#66667C',
  strokeWidth = 1.5,
  fill = 'none',
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 18 18"
      width={size}
      height={size}
      fill={fill}
      stroke={color}
      strokeWidth={strokeWidth}
      opacity={50}
    >
      <path d="M15.5,8.1v5.8c0,1.43-1.16,2.6-2.6,2.6H5.1c-1.44,0-2.6-1.16-2.6-2.6v-5.8c0-1.04,.89-3.25,1.5-4.1h0v-2c0-.55,.45-1,1-1H13c.55,0,1,.45,1,1v2h0c.61,.85,1.5,3.06,1.5,4.1Z" />
      <line x1="4" y1="4" x2="9" y2="4" />
      <line x1="11.26" y1="4" x2="14" y2="4" />
    </svg>
  )
}
