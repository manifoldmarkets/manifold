// from Feather: https://feathericons.com/
export default function PlaceholderGraph(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      // width="18"
      // height="18"
      className={props.className}
      viewBox="0 0 18 18"
      fill="currentColor"
      strokeWidth="2"
      preserveAspectRatio="none"
      {...props}
    >
      <polygon points="0 18 7 8 9 11 14.54 0 18 5 18 18 0 18" />
    </svg>
  )
}
