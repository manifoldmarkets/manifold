import { createContext, useContext } from 'react'

// The time the map is rewound to, or undefined for live odds. A rewound
// market is re-priced for display only (common/market-probs-history), so
// anything that would quote or place a bet must stay off while it is set.
export const ElectionAsOfContext = createContext<number | undefined>(undefined)

export const useElectionAsOf = () => useContext(ElectionAsOfContext)
