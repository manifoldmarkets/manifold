import { ExpandingInput } from '../widgets/expanding-input'
import { Title } from '../widgets/title'

export function EditableTitle(props: {
  title: string
  setTitle: Function
  editMode: boolean
}) {
  const { title, setTitle, editMode } = props
  if (editMode) {
    return (
      <ExpandingInput
        placeholder={'Dashboard Title'}
        autoFocus
        maxLength={150}
        value={title}
        onChange={(e) => setTitle(e.target.value || '')}
        className="my-2 grow"
      />
    )
  }
  return <Title className="mt-4">{title}</Title>
}
