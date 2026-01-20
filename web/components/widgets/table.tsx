import clsx from 'clsx'

/** `<table>` with styles. Expects table html (`<thead>`, `<td>` etc) */
export const Table = (props: {
  className?: string
  children: React.ReactNode
}) => {
  const { className, children } = props

  return (
    <table
      className={clsx(
        'text-ink-700 w-full whitespace-nowrap text-left text-sm',
        '[&>thead]:text-ink-500 [&>thead]:text-xs [&>thead]:font-medium [&>thead]:uppercase [&>thead]:tracking-wider',
        '[&_td]:px-3 [&_td]:py-2.5 [&_th]:px-3 [&_th]:py-2',
        '[&>tbody>tr]:border-ink-200 [&>tbody>tr]:border-b [&>tbody>tr:last-child]:border-b-0',
        '[&>tbody>tr]:transition-colors [&>tbody>tr:hover]:bg-ink-100/50',
        className
      )}
    >
      {children}
    </table>
  )
}
