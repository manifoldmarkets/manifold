export type TopicInfo = { name: string; groupId: string }
import { getGroupBySlug } from 'web/lib/supabase/groups'

export const TOPICS_TO_SUBTOPICS: { [key: string]: TopicInfo[] } = {
  '🎓 General College Topics': [
    {
      name: '🎓 College Admissions',
      groupId: '1dyUqp3vyXcGeRwiCl3S',
    },
    {
      name: 'MIT',
      groupId: 'TKAbWFIO8fNfwtAaT53G',
    },
    {
      name: 'Stanford',
      groupId: '5d3e362a-d2e6-4edc-9f33-b4bc449d07ee',
    },
    {
      name: 'Harvard',
      groupId: 'e2bd5bc1-1eb2-414f-94fe-ef795855fd92',
    },
    {
      name: 'Princeton',
      groupId: '38e51fb4-102a-4119-b437-ea922042ab59',
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
    { name: '🎿 Skiing', groupId: '1003ae77-1fce-408d-a9a8-4b2ed6d92f70' },
    { name: '🏈 Football', groupId: 'Vcf6CYTTSXAiStbKSqQq' },
    { name: '⚾ Baseball/Softball', groupId: '786nRQzgVyUnuUtaLTGW' },
    { name: '🏀 Basketball', groupId: 'NjkFkdkvRvBHoeMDQ5NB' },
    { name: '🏐 Volleyball', groupId: 'gojfn6bFjZ2KhLhg6OpF' },
    { name: '🎳 Bowling', groupId: '1f50cdab-0bea-45d2-a07a-2b5ceb1b33cd' },
    { name: '🏃 Running', groupId: 'PaaoqRhsQCCuJW5JjRsl' },
    { name: '🤺 Fencing', groupId: 'gLpflbSdSrixgpWjjyy1' },
    { name: '🏑 Field/Ice Hockey', groupId: 'tYP9jmPPjoX29KfzE4l5' },
    { name: '⛳ Golf', groupId: 'NxkKZhLxyZglOcGxX6zn' },
    { name: '🤸 Gymnastics', groupId: '3b48767c-284e-49eb-b4d8-de5eef5fe679' },
    { name: '🏊 Swimming', groupId: '5G3Vrz57WuJqkSPdRgFw' },
    { name: '💦 Diving', groupId: '5a00cfbc-6800-471b-8f71-930a0d995a42' },
    { name: '🥍 Lacrosse', groupId: '4a7ad8ed-469d-4cf7-b29c-41d39222468f' },
    { name: '🚣 Rowing', groupId: 'UflCfpWvtdKZbPqHIyNa' },
    { name: '⚽ Soccer', groupId: 'ypd6vR44ZzJyN9xykx6e' },
    { name: '🎾 Tennis', groupId: '1mvN9vIVIopcWiAsXhzp' },
    { name: '🤽 Water Polo', groupId: 'bd01f80e-9ed9-4ba6-b33f-b136e828e5ea' },
    { name: '🤼 Wrestling', groupId: '8j7nBRAbAX309o2IZUuV' },
  ],

  '🧠 Other Activities': [
    {
      name: '🎤 Competitive Debate',
      groupId: '5e9cd2e5-3f46-4d95-9713-19bd89634af5',
    },
    {
      name: '🎵 Music',
      groupId: '23ffe5ed-81a1-4a10-99a1-eb933daae0ed',
    },
    { name: '✍️ Writing', groupId: '66jDurBcd8SrQjfwHxXo' },
    { name: '🎨 Art', groupId: '84f81083-4151-48df-9347-f05b880df70c' },
    { name: '♟️ Chess', groupId: 'ED7Cu6lVPshJkZ7FYePW' },
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
