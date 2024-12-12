export type TaskCategory = {
  id: number
  name: string
  color?: string
  displayOrder: number
  archived?: boolean
}

export type Task = {
  id: number
  creator_id: string
  assignee_id: string
  text: string
  completed: boolean
  category_id: number // -1 for inbox
  created_time: number
  priority: number
  archived: boolean
}
