import React, { ReactElement, ReactNode, ReactPortal } from 'react'

/** Traverse react element's tree, replacing className prop with tw for satori engine */
export function replaceTw(element: Exclude<ReactNode, ReactPortal>): ReactNode {
  // base case
  if (!element || typeof element !== 'object') {
    return element
  }

  // fragment
  if (!('type' in element)) {
    return <>{Array.from(element).map(replaceTw)}</>
  }

  // component
  if (typeof element.type === 'function') {
    if (element.type.prototype?.isReactComponent) {
      throw Error(
        'React class component not supported in classname to tw middleware because Sinclair is lazy.'
      )
      // new component; component.render() etc ???
    }

    // functional component
    const component = element.type as (props: any) => ReactElement

    const newType = (props: any) => replaceTw(component(props)) as ReactElement
    return React.createElement(newType, element.props)
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
  const newChildren = children
    ? Array.isArray(children)
      ? children.map(replaceTw)
      : [replaceTw(children)]
    : []

  return React.createElement(element.type, newProps, newChildren)
}
