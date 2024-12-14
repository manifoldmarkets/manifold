import { createContext, useContext, useState } from 'react';


type TokenMode = 'play' | 'sweep';

type TokenModeContextType = {
  mode: TokenMode;
  setMode: (mode: TokenMode) => void;
};

const TokenModeContext = createContext<TokenModeContextType | undefined>(undefined);

export function TokenModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<TokenMode>('play');

  const value = {
    mode,
    setMode,
  };

  return <TokenModeContext.Provider value={value}>{children}</TokenModeContext.Provider>;
}

export function useTokenMode() {
  const context = useContext(TokenModeContext);
  if (!context) {
    throw new Error('useTokenMode must be used within an TokenModeProvider');
  }
  return context;
} 