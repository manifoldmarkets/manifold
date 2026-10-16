import { runScript } from 'run-script'
import { groupPath } from 'common/group'
import { revalidateStaticProps } from 'shared/utils'

// /sports gives a chip to every subtopic of 🏟️ Sports (see buildSportsIndex
// in common/src/sports-schedule.ts), so a sport that isn't filed under Sports
// never shows up there. This files the sports that were missing, the obvious
// subtopics of those sports, and two duplicates under the sport they repeat.
//
// Dry-runs by default (prints each link and whether it would be added). Pass
// --commit to add them. Safe to re-run: existing links are skipped.

const commit = process.argv.includes('--commit')

const LINKS: [parent: string, child: string][] = [
  // Sports missing from 🏟️ Sports.
  ['sports-default', 'cricket'],
  ['sports-default', 'rugby'],
  ['sports-default', 'athletics'],
  ['sports-default', 'olympics'],
  ['sports-default', 'horse-racing'],
  ['sports-default', 'afl'],
  ['sports-default', 'swimming'],
  ['sports-default', 'fencing'],
  ['sports-default', 'pickleball'],
  ['sports-default', 'rock-climbing'],
  // Leagues and events of those sports, so their markets count too.
  ['cricket', 'ipl'],
  ['cricket', 'ipl-2026'],
  ['cricket', 'cricket-world-cup-2023'],
  ['cricket', 'cricket-trades'],
  ['rugby', 'rugby-union'],
  ['rugby', '2023-rugby-world-cup'],
  ['olympics', '2024-summer-olympics'],
  ['olympics', '2026-winter-olympics'],
  ['athletics', 'track-and-field'],
  ['athletics', 'running'],
  ['athletics', 'marathon'],
  // Duplicates: fold into the sport they repeat instead of a second chip.
  ['hockey', 'ice-hockey'],
  ['mma', 'mma-mixed-martial-arts'],
]

runScript(async ({ pg }) => {
  const slugs = [...new Set(LINKS.flat())]
  const groups = await pg.manyOrNone<{
    id: string
    slug: string
    name: string
    privacy_status: string
  }>(
    `select id, slug, name, privacy_status from groups where slug in ($1:list)`,
    [slugs]
  )
  const bySlug = new Map(groups.map((g) => [g.slug, g]))

  const toAdd: { top: string; bottom: string; label: string }[] = []
  for (const [parentSlug, childSlug] of LINKS) {
    const label = `${parentSlug} → ${childSlug}`
    const parent = bySlug.get(parentSlug)
    const child = bySlug.get(childSlug)
    if (!parent || !child) {
      console.log(`skip ${label}: no topic ${!parent ? parentSlug : childSlug}`)
      continue
    }
    if (
      parent.privacy_status !== 'public' ||
      child.privacy_status !== 'public'
    ) {
      console.log(`skip ${label}: not public`)
      continue
    }
    const [exists, cycle] = await Promise.all([
      pg.oneOrNone(
        `select 1 from group_groups where top_id = $1 and bottom_id = $2`,
        [parent.id, child.id]
      ),
      // Would the parent end up inside its own child?
      pg.oneOrNone(
        `with recursive below(id) as (
           select $1::text
           union
           select gg.bottom_id from group_groups gg join below b on gg.top_id = b.id
         )
         select 1 from below where id = $2`,
        [child.id, parent.id]
      ),
    ])
    if (exists) {
      console.log(`skip ${label}: already linked`)
      continue
    }
    if (cycle) {
      console.log(`skip ${label}: ${parentSlug} is already under ${childSlug}`)
      continue
    }
    console.log(`${commit ? 'add' : 'would add'} ${label} (${child.name})`)
    toAdd.push({ top: parent.id, bottom: child.id, label })
  }

  if (!commit) {
    console.log(`\n${toAdd.length} links to add. Re-run with --commit to add.`)
    return
  }

  for (const { top, bottom } of toAdd) {
    await pg.none(
      `insert into group_groups (top_id, bottom_id) values ($1, $2)
       on conflict do nothing`,
      [top, bottom]
    )
  }
  console.log(`\nAdded ${toAdd.length} links.`)

  // Topic pages list their subtopics; refresh the ones that changed.
  const touched = new Set(toAdd.flatMap(({ top, bottom }) => [top, bottom]))
  for (const g of groups.filter((g) => touched.has(g.id))) {
    try {
      await revalidateStaticProps(groupPath(g.slug))
    } catch (e) {
      console.log(`could not revalidate ${groupPath(g.slug)}:`, e)
    }
  }
})
