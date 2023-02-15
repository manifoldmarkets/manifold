import React from 'react'

export function replaceTw(element: JSX.Element | string): JSX.Element {
  // Base case
  if (typeof element === 'string' || !element?.props) {
    return element as JSX.Element
  }

  // Replace `className` with `tw` for this element
  const { props } = element
  const newProps = { ...props }
  if (props.className) {
    newProps.tw = props.className
    delete newProps.className
  }

  // Recursively replace children, whether we have many, one, or no children
  const { children } = props
  const newChildren: (JSX.Element | string)[] = children
    ? Array.isArray(children)
      ? children.map(replaceTw)
      : [replaceTw(children)]
    : []

  return React.createElement(element.type, newProps, newChildren)
}
