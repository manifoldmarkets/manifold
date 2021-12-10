import React from 'react'
import { Button } from './button'
import { Row } from './layout/row'

export function YesNoSelector(props: {
  selected: 'yes' | 'no'
  onSelect: (selected: 'yes' | 'no') => void
  yesLabel?: string
  noLabel?: string
  className?: string
}) {
  const { selected, onSelect, yesLabel, noLabel, className } = props

  return (
    <Row className={className}>
      <Button
        color={selected === 'yes' ? 'green' : 'deemphasized'}
        hideFocusRing
        onClick={() => onSelect('yes')}
      >
        {yesLabel ?? 'Yes'}
      </Button>

      <Button
        color={selected === 'no' ? 'red' : 'deemphasized'}
        hideFocusRing
        onClick={() => onSelect('no')}
        className="ml-3"
      >
        {noLabel ?? 'No'}
      </Button>
    </Row>
  )
}
