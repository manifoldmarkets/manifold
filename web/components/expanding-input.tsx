import clsx from 'clsx'
import Textarea from 'react-expanding-textarea'

/** Expanding `<textarea>` with same style as input.tsx */
export const ExpandingInput = (props: Parameters<typeof Textarea>[0]) => {
  const { className, ...rest } = props
  return (
    <Textarea
      className={clsx(
        'textarea textarea-bordered resize-none text-[16px] md:text-[14px]',
        className
      )}
      {...rest}
    />
  )
}
