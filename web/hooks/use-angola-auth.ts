// ============================================================================
// ANGOLA AUTH HOOK
// ============================================================================
// React hook for managing Supabase authentication state
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { AuthChangeEvent } from '@supabase/supabase-js'
import {
  AuthUser,
  AuthSession,
  loginWithGoogle,
  requestPhoneOTP,
  verifyPhoneOTP,
  logout,
  getCurrentUser,
  getCurrentSession,
  onAuthStateChange,
  getUserDisplayName,
  getUserAvatarUrl,
} from 'web/lib/supabase/auth'

export type AuthState = {
  user: AuthUser | null
  session: AuthSession | null
  loading: boolean
  error: string | null
}

export type UseAngolaAuthReturn = AuthState & {
  // Actions
  signInWithGoogle: () => Promise<void>
  sendPhoneOTP: (phone: string) => Promise<boolean>
  verifyOTP: (phone: string, code: string) => Promise<boolean>
  signOut: () => Promise<void>
  clearError: () => void

  // Helpers
  isAuthenticated: boolean
  displayName: string
  avatarUrl: string | null
}

export function useAngolaAuth(): UseAngolaAuthReturn {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
    error: null,
  })

  // Initialize auth state
  useEffect(() => {
    let mounted = true

    async function loadInitialState() {
      try {
        const [user, session] = await Promise.all([
          getCurrentUser(),
          getCurrentSession(),
        ])

        if (mounted) {
          setState({
            user,
            session,
            loading: false,
            error: null,
          })
        }
      } catch (err) {
        if (mounted) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: 'Erro ao carregar estado de autenticacao',
          }))
        }
      }
    }

    loadInitialState()

    // Subscribe to auth changes
    const { unsubscribe } = onAuthStateChange(
      (event: AuthChangeEvent, session: AuthSession | null) => {
        if (mounted) {
          setState((prev) => ({
            ...prev,
            user: session?.user ?? null,
            session,
            loading: false,
          }))
        }
      }
    )

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  // Sign in with Google
  const signInWithGoogle = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }))

    const result = await loginWithGoogle()

    if (!result.success) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: result.error || 'Erro ao fazer login com Google',
      }))
    }
    // If success, the auth state will be updated by the listener
  }, [])

  // Send phone OTP
  const sendPhoneOTP = useCallback(async (phone: string): Promise<boolean> => {
    setState((prev) => ({ ...prev, loading: true, error: null }))

    const result = await requestPhoneOTP(phone)

    setState((prev) => ({
      ...prev,
      loading: false,
      error: result.success ? null : result.error || 'Erro ao enviar codigo',
    }))

    return result.success
  }, [])

  // Verify OTP
  const verifyOTP = useCallback(
    async (phone: string, code: string): Promise<boolean> => {
      setState((prev) => ({ ...prev, loading: true, error: null }))

      const result = await verifyPhoneOTP(phone, code)

      if (!result.success) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: result.error || 'Codigo invalido',
        }))
        return false
      }

      // Auth state will be updated by the listener
      return true
    },
    []
  )

  // Sign out
  const signOut = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }))

    const result = await logout()

    if (!result.success) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: result.error || 'Erro ao sair',
      }))
    }
    // Auth state will be updated by the listener
  }, [])

  // Clear error
  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }))
  }, [])

  return {
    ...state,
    signInWithGoogle,
    sendPhoneOTP,
    verifyOTP,
    signOut,
    clearError,
    isAuthenticated: !!state.user,
    displayName: getUserDisplayName(state.user),
    avatarUrl: getUserAvatarUrl(state.user),
  }
}

// ============================================================================
// CONTEXT PROVIDER
// ============================================================================

import { createContext, useContext, ReactNode } from 'react'

const AngolaAuthContext = createContext<UseAngolaAuthReturn | null>(null)

export function AngolaAuthProvider({ children }: { children: ReactNode }) {
  const auth = useAngolaAuth()

  return (
    <AngolaAuthContext.Provider value={auth}>
      {children}
    </AngolaAuthContext.Provider>
  )
}

export function useAuth(): UseAngolaAuthReturn {
  const context = useContext(AngolaAuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AngolaAuthProvider')
  }
  return context
}
