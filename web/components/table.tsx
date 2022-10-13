import clsx from 'clsx'

/** `<table>` with styles. Expects table html (`<thead>`, `<td>` etc) */
export const Table = (props: {
  zebra?: boolean
  className?: string
  children: React.ReactNode
}) => {
  const { className, children } = props

  return (
    <table
      className={clsx(
        'w-full whitespace-nowrap text-left text-sm text-gray-500 [&_td]:p-2 [&_th]:p-2 [&>thead]:font-bold [&>tbody_tr:nth-child(odd)]:bg-white',
        className
      )}
    >
      {children}
    </table>
  )
}
