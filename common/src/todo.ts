export type TaskCategory = {
  id: number
  name: string
  color?: string
  displayOrder: number
  archived?: boolean
}

export type Task = {
  id: number
  text: string
  completed: boolean
  categoryId: number // -1 for inbox
  createdAt: number
  priority: number
  archived: boolean
}
