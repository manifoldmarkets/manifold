import clsx from 'clsx'
import React from 'react'

/** Text input. Wraps html `<input>` */
export const Input = (props: JSX.IntrinsicElements['input']) => {
  const { className, ...rest } = props

  return (
    <input
      className={clsx('input input-bordered text-base md:text-sm', className)}
      {...rest}
    />
  )
}

/*
  TODO: replace daisyui style with our own. For reference:

  james: text-lg placeholder:text-gray-400
  inga: placeholder:text-greyscale-4 border-greyscale-2 rounded-md
  austin: border-gray-300 text-gray-400 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm
 */
