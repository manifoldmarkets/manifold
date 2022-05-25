// Icon from Bootstrap: https://icons.getbootstrap.com/
export default function TriangleDownFillIcon(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      className={props.className}
      viewBox="0 0 16 16"
    >
      <path
        fillRule="evenodd"
        transform="rotate(-180 8 8)"
        d="M7.022 1.566a1.13 1.13 0 0 1 1.96 0l6.857 11.667c.457.778-.092 1.767-.98 1.767H1.144c-.889 0-1.437-.99-.98-1.767L7.022 1.566z"
      />
    </svg>
  )
}
