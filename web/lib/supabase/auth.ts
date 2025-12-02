// ============================================================================
// SUPABASE AUTHENTICATION MODULE
// ============================================================================
// Replaces Firebase Auth with Supabase Auth
// Supports: Google OAuth and Phone (OTP) authentication
// ============================================================================

import {
  AuthChangeEvent,
  AuthError,
  Session,
  User as SupabaseUser,
} from '@supabase/supabase-js'
import { db } from './db'
import { getAngolaConfig } from 'common/envs/angola'

const config = getAngolaConfig()

// ============================================================================
// Types
// ============================================================================

export type AuthUser = SupabaseUser

export type AuthSession = Session

export type AuthState = {
  user: AuthUser | null
  session: AuthSession | null
  loading: boolean
  error: AuthError | null
}

// ============================================================================
// Google OAuth Login
// ============================================================================

export async function loginWithGoogle(): Promise<{
  success: boolean
  error?: string
}> {
  if (!config.authProviders.google) {
    return { success: false, error: 'Google login is not enabled' }
  }

  try {
    const { data, error } = await db.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    })

    if (error) {
      console.error('Google login error:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    console.error('Google login exception:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Login failed',
    }
  }
}

// ============================================================================
// Phone OTP Login
// ============================================================================

export async function requestPhoneOTP(phoneNumber: string): Promise<{
  success: boolean
  error?: string
}> {
  if (!config.authProviders.phone) {
    return { success: false, error: 'Phone login is not enabled' }
  }

  // Validate phone number format (Angola: +244)
  const normalizedPhone = normalizeAngolaPhoneNumber(phoneNumber)
  if (!normalizedPhone) {
    return {
      success: false,
      error: 'Numero de telefone invalido. Use o formato: +244 9XX XXX XXX',
    }
  }

  try {
    const { data, error } = await db.auth.signInWithOtp({
      phone: normalizedPhone,
      options: {
        shouldCreateUser: true,
      },
    })

    if (error) {
      console.error('Phone OTP error:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    console.error('Phone OTP exception:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Falha ao enviar codigo',
    }
  }
}

export async function verifyPhoneOTP(
  phoneNumber: string,
  otpCode: string
): Promise<{
  success: boolean
  user?: AuthUser
  error?: string
}> {
  const normalizedPhone = normalizeAngolaPhoneNumber(phoneNumber)
  if (!normalizedPhone) {
    return { success: false, error: 'Numero de telefone invalido' }
  }

  try {
    const { data, error } = await db.auth.verifyOtp({
      phone: normalizedPhone,
      token: otpCode,
      type: 'sms',
    })

    if (error) {
      console.error('OTP verification error:', error)
      return { success: false, error: error.message }
    }

    if (!data.user) {
      return { success: false, error: 'Verificacao falhou' }
    }

    return { success: true, user: data.user }
  } catch (err) {
    console.error('OTP verification exception:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Verificacao falhou',
    }
  }
}

// ============================================================================
// Session Management
// ============================================================================

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const {
      data: { user },
    } = await db.auth.getUser()
    return user
  } catch {
    return null
  }
}

export async function getCurrentSession(): Promise<AuthSession | null> {
  try {
    const {
      data: { session },
    } = await db.auth.getSession()
    return session
  } catch {
    return null
  }
}

export async function getAccessToken(): Promise<string | null> {
  const session = await getCurrentSession()
  return session?.access_token ?? null
}

export async function refreshSession(): Promise<AuthSession | null> {
  try {
    const { data, error } = await db.auth.refreshSession()
    if (error) {
      console.error('Session refresh error:', error)
      return null
    }
    return data.session
  } catch {
    return null
  }
}

// ============================================================================
// Logout
// ============================================================================

export async function logout(): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await db.auth.signOut()

    if (error) {
      console.error('Logout error:', error)
      return { success: false, error: error.message }
    }

    // Clear any local storage
    if (typeof window !== 'undefined') {
      localStorage.removeItem('CACHED_REFERRAL_KEY')
      localStorage.removeItem('CACHED_REFERRAL_CONTRACT_KEY')
    }

    return { success: true }
  } catch (err) {
    console.error('Logout exception:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Logout failed',
    }
  }
}

// ============================================================================
// Auth State Listener
// ============================================================================

export function onAuthStateChange(
  callback: (event: AuthChangeEvent, session: AuthSession | null) => void
): { unsubscribe: () => void } {
  const {
    data: { subscription },
  } = db.auth.onAuthStateChange(callback)

  return {
    unsubscribe: () => subscription.unsubscribe(),
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Normalize Angola phone numbers to E.164 format
 * Accepts: 9XX XXX XXX, +244 9XX XXX XXX, 244 9XX XXX XXX
 * Returns: +244XXXXXXXXX or null if invalid
 */
export function normalizeAngolaPhoneNumber(phone: string): string | null {
  // Remove all non-digit characters except leading +
  let cleaned = phone.replace(/[^\d+]/g, '')

  // Remove leading +
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1)
  }

  // If starts with 244, remove it
  if (cleaned.startsWith('244')) {
    cleaned = cleaned.substring(3)
  }

  // Should now have 9 digits starting with 9
  if (cleaned.length === 9 && cleaned.startsWith('9')) {
    return `+244${cleaned}`
  }

  return null
}

/**
 * Format phone number for display
 */
export function formatPhoneForDisplay(phone: string): string {
  const normalized = normalizeAngolaPhoneNumber(phone)
  if (!normalized) return phone

  // Format as +244 9XX XXX XXX
  const digits = normalized.replace('+244', '')
  return `+244 ${digits.substring(0, 3)} ${digits.substring(3, 6)} ${digits.substring(6)}`
}

/**
 * Check if user has verified phone
 */
export function hasVerifiedPhone(user: AuthUser | null): boolean {
  return user?.phone_confirmed_at != null
}

/**
 * Get user's auth provider
 */
export function getAuthProvider(
  user: AuthUser | null
): 'google' | 'phone' | null {
  if (!user) return null

  if (user.app_metadata?.provider === 'google') {
    return 'google'
  }

  if (user.phone) {
    return 'phone'
  }

  return null
}

// ============================================================================
// User Profile Helpers
// ============================================================================

/**
 * Update user metadata (profile info stored in Supabase Auth)
 */
export async function updateUserMetadata(metadata: {
  name?: string
  avatar_url?: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await db.auth.updateUser({
      data: metadata,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Update failed',
    }
  }
}

/**
 * Get display name from user
 */
export function getUserDisplayName(user: AuthUser | null): string {
  if (!user) return 'Anonimo'

  // Try different sources for name
  const name =
    user.user_metadata?.name ||
    user.user_metadata?.full_name ||
    user.email?.split('@')[0] ||
    formatPhoneForDisplay(user.phone || '')

  return name || 'Anonimo'
}

/**
 * Get avatar URL from user
 */
export function getUserAvatarUrl(user: AuthUser | null): string | null {
  if (!user) return null

  return (
    user.user_metadata?.avatar_url || user.user_metadata?.picture || null
  )
}
