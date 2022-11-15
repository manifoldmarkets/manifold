export default function ManaIcon(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      className={props.className}
      viewBox="0 0 18 18"
    >
      <path d="M2.32,16V2h2.12l5.1,8.3-1.02-.02L13.68,2h2v14h-2.16v-5.74c0-1.2,.03-2.28,.09-3.24,.06-.96,.16-1.91,.31-2.86l.28,.74-4.58,7.08h-1.32L3.86,4.98l.22-.82c.15,.89,.25,1.81,.31,2.75,.06,.94,.09,2.06,.09,3.35v5.74H2.32Z" />
      <line x1="18" y1="11" x2="0" y2="11" />
      <line x1="18" y1="14" x2="0" y2="14" />
    </svg>
  )
}
