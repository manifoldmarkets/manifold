'use client'
import { DaimoSDKProvider } from '@daimo/sdk/web'
import '@daimo/sdk/web/theme.css'
import { ReactNode } from 'react'

export function DaimoProviders({ children }: { children: ReactNode }) {
  return <DaimoSDKProvider>{children}</DaimoSDKProvider>
}
