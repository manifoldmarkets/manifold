export default function Coin({
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
      transform="rotate(-30)"
    >
      <path
        className="cls-2"
        d="M15,9c0,.35-.07,.68-.2,1-.66,1.73-3.01,3-5.8,3s-5.14-1.27-5.8-3c-.13-.32-.2-.65-.2-1,0-2.21,2.69-4,6-4s6,1.79,6,4Z"
      />
      <path
        className="cls-1"
        d="M15,9v2c0,2.21-2.69,4-6,4s-6-1.79-6-4v-2c0,.35,.07,.68,.2,1,.66,1.73,3.01,3,5.8,3s5.14-1.27,5.8-3c.13-.32,.2-.65,.2-1Z"
      />
    </svg>
  )
}
