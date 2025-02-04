## Design Principles

### Server-Side Data Fetching

When fetching data in getStaticProps or getServerSideProps:
- Use the Supabase client (db) directly instead of the API client
- API client won't work because it requires auth which isn't available during static generation
- Import db from web/lib/supabase/db
- Use contractFields and convertContract from common/supabase/contracts when querying contracts
- Example:
```ts
const { data } = await db
  .from('contracts')
  .select(contractFields)
  .eq('visibility', 'public')
```

### Mana/Sweepstakes Market Pairs

Markets can exist in both mana and sweepstakes versions, displayed together on the same page. When building UI components:

- Prefer passing specific data (like answer lists) rather than entire contract objects to reduce prop threading complexity
- Remember components may need to handle data from both market versions
- Consider which contract (mana or sweepstakes) owns the source of truth for shared data

Component design patterns:

- Break components into small, focused pieces that handle one type of data
- Pass minimal props - e.g. pass answer objects instead of whole contracts
- For shared UI elements like answer displays, prefer passing the specific data needed (answer text, probability, etc.) rather than passing the entire contract
- Keep market-type-specific logic (mana vs sweepstakes) in container components, not shared display components

### Components

Our design system can be found on pages/styles.tsx. You can can find reference implementation of colors, buttons, toggles, and input fields. If you make a new reusable component, add it to the styles page.

- Use Headless UI (v2.2+) for dropdowns and popovers
- Use tiptap for text editors
- We wrap libraries in our own components, for convenience

- Consider dark mode when adding new UI components. Use color classes that respect the current theme (like `outline-purple-700 dark:outline-purple-300`)
  - `canvas`, `ink` (grays), `primary` (indigos), `teal` and `scarlet` already respect dark mode. like `text-ink-700` will be gray-700 in light mode and gray-300 in dark mode. this is defined in globals.css
- Use container classes, wrapping, or width settings to ensure new elements align well with existing ones and are responsive at various screen sizes.
