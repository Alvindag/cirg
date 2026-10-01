import { createContext, useContext } from 'react'
import type { Api } from './api/client'
import type { Me } from './api/types'

export interface AppContextValue {
  api: Api
  me: Me
  signOut: () => void
}

export const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const v = useContext(AppContext)
  if (!v) throw new Error('useApp must be used inside the signed-in app')
  return v
}
