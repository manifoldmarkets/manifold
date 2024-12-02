## Design Principles

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

Refactoring strategy for dual market support:

- Use grep to find all usages of a component before modifying it
- Start with leaf components that have fewer dependencies
- When threading props becomes complex, consider creating intermediate container components
- Extract market-specific logic into hooks or container components

### Dark Mode and Component Consistency

- Always consider dark mode when adding new UI components. Use color classes that respect the current theme (e.g., `text-ink-700 dark:text-ink-300` instead of fixed color classes).
- Maintain consistent width with other components on the page. Use similar container classes or width settings to ensure new elements align well with existing ones.
- When adding new components or modifying existing ones, check how they look in both light and dark modes, and at various screen sizes to ensure responsiveness.
