export default function Curve({
  size = 24,
  color = '#B1B1C7',
  strokeWidth = 2,
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 18 18"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      style={{ transform: 'rotate(90deg)' }}
    >
      <path d="M5.02,0V5.24c0,4.3,3.49,7.79,7.79,7.79h5.2" />
    </svg>
  )
}
