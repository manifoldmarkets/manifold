import clsx from 'clsx'
import Textarea from 'react-expanding-textarea'

/** Expanding `<textarea>` with same style as input.tsx */
export const ExpandingInput = (props: Parameters<typeof Textarea>[0]) => {
  const { className, ...rest } = props
  return (
    <Textarea
      className={clsx(
        'resize-none rounded-md border border-gray-300 bg-white px-4 text-[16px] leading-loose shadow-sm transition-colors focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-500 md:text-[14px]',
        className
      )}
      {...rest}
    />
  )
}
