export type TopicInfo = { name: string; groupId: string }
import { getGroupBySlug } from 'web/lib/supabase/groups'

export const TOPICS_TO_SUBTOPICS: { [key: string]: TopicInfo[] } = {
  '🎓 General College Topics': [
    {
      name: '🎓 General College Admissions',
      groupId: '1dyUqp3vyXcGeRwiCl3S',
    },
    {
      name: 'MIT',
      groupId: '79389058-1654-404b-98a1-c21ab07d9aec',
    },
    {
      name: 'Stanford',
      groupId: 'dadb1fcf-7758-44f1-942c-a51a7ed8953b',
    },
    {
      name: 'Harvard',
      groupId: '036fba01-9bce-4869-af39-f679d0394004',
    },
    {
      name: 'Princeton',
      groupId: 'b91fe19e-1293-44a8-8532-889afc24424f',
    },
  ],
  '📚 Math/Science Competitions': [
    {
      name: '🔬 Biology Competitions',
      groupId: 'ff1be885-eae6-4001-ba82-5b8f3dfabcb9',
    },
    {
      name: '🧪 Chemistry Competitions',
      groupId: '1c7fb168-13fe-4baf-822e-59c6e768241b',
    },
    {
      name: '📐 Physics Competitions',
      groupId: 'fbb2a4c4-feb8-475e-9c57-4db42699c114',
    },
    {
      name: '🔢 Math Competitions',
      groupId: '64e0006d-606d-4e68-ad95-045c341bb9d1',
    },
    {
      name: '🖥️ CS Competitions',
      groupId: 'ebfc51ef-eff4-4813-9ae7-0573e0b15da6',
    },
  ],
  '💻 Sports': [
    { name: '🎿 Skiing', groupId: 'cabeb98d-457a-4e13-b625-f5ba4bd2e0b0' },
    { name: '🏈 Football', groupId: '5e886590-e861-4c91-bcca-01b44439e999' },
    {
      name: '⚾ Baseball/Softball',
      groupId: 'fc40ab23-dad6-4a32-b566-95e81d638e47',
    },
    { name: '🏀 Basketball', groupId: 'e5130a0d-80fe-41aa-88f3-cfba0364390c' },
    { name: '🏐 Volleyball', groupId: 'c3ddae30-74c9-4406-9d33-44f1d9f67820' },
    { name: '🎳 Bowling', groupId: 'e89c9c5e-2667-49d8-bea6-9244d0dd4627' },
    { name: '🏃 Running', groupId: '36d81b51-2985-4376-9a9b-e5498beafad0' },
    { name: '🤺 Fencing', groupId: '7c2216d0-0947-4a4d-9dcb-7e537276dad9' },
    {
      name: '🏑 Field/Ice Hockey',
      groupId: '63e09aaa-fa01-4809-9060-2aa0424f45a7',
    },
    { name: '⛳ Golf', groupId: '6f664806-f3d9-41a6-8d62-36c823f09cf3' },
    { name: '🤸 Gymnastics', groupId: '421e932e-11c1-460f-90a2-89aa03f09247' },
    { name: '🏊 Swimming', groupId: '0637afc6-e833-429c-9c7c-328e1c2429d5' },
    { name: '💦 Diving', groupId: '6bf24aee-ad6e-47ea-8ec0-d74e175c0365' },
    { name: '🥍 Lacrosse', groupId: '933d0777-1aaa-4ca3-82ae-087d542d57a0' },
    { name: '🚣 Rowing', groupId: 'f1b9dea0-3c95-42ce-8541-f9d1f8eb96c4' },
    { name: '⚽ Soccer', groupId: '34dea8d2-550d-45f8-a80d-cee3b9a41e6d' },
    { name: '🎾 Tennis', groupId: 'f624dd9a-131d-4f1b-ad94-d79205b219e3' },
    { name: '🤽 Water Polo', groupId: '224f4e72-4b7f-42b9-926e-048a7adc9c14' },
    { name: '🤼 Wrestling', groupId: '0ed3d6b0-7999-4cdd-816d-3ec75b11abcb' },
  ],

  '🧠 Other Activities': [
    {
      name: '🎤 Competitive Debate',
      groupId: '0d79acc1-eb2b-4da1-993c-4297b8ad89e9',
    },
    {
      name: '🎵 Music',
      groupId: '1c2f1d15-cf9b-49ea-9674-7078a56fde9c',
    },
    { name: '✍️ Writing', groupId: '07fd485d-f237-4215-ad85-cb947b907fe9' },
    { name: '🎨 Art', groupId: 'eb967d3b-3c9d-4955-8394-8b1602bf4f17' },
    { name: '♟️ Chess', groupId: '05c86ace-6b6a-4e58-b6f4-1c18dc634a6b' },
  ],
}

export const removeEmojis = (input: string) =>
  // eslint-disable-next-line no-control-regex
  input.replace(/[^\x00-\x7F]/g, '').trim()

export const getSubtopics = (topic: string) =>
  TOPICS_TO_SUBTOPICS[topic].map(
    (subtopic) =>
      [subtopic.name, removeEmojis(subtopic.name), subtopic.groupId] as const
  )
export const ALL_TOPICS = Object.keys(TOPICS_TO_SUBTOPICS)
  .map((topic) => getSubtopics(topic).map(([_, subtopic]) => subtopic))
  .flat()
