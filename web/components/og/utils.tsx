import { OG_CARD_HEIGHT, OG_CARD_WIDTH } from 'common/edge/og'
import { createElement, ReactElement, ReactNode } from 'react'

/** Wraps a card laid out at the base size so satori rasterizes it at `scale`x */
export function scaleCard(card: ReactElement, scale: number) {
  if (scale === 1) return card
  return (
    <div
      style={{
        display: 'flex',
        width: OG_CARD_WIDTH * scale,
        height: OG_CARD_HEIGHT * scale,
      }}
    >
      <div
        style={{
          display: 'flex',
          width: OG_CARD_WIDTH,
          height: OG_CARD_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        {card}
      </div>
    </div>
  )
}

// new function for type reasons
export function classToTw(element: ReactElement) {
  return replaceTw(element) as ReactElement
}

/** Traverse react element's tree, replacing className prop with tw for satori engine */
function replaceTw(element: ReactNode): ReactNode {
  // base case
  if (!element || typeof element !== 'object') {
    if (typeof element === 'string') return element
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
    }

    // functional component
    const component = element.type as (props: any) => ReactElement

    const newType = (props: any) => replaceTw(component(props)) as ReactElement
    return createElement(newType, element.props)
  }

  // pure element

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

  return createElement(element.type, newProps, newChildren)
}
