import type { SupabaseClient } from '@supabase/supabase-js'

export interface GoogleCredentialResponse {
  credential: string
}

interface GoogleButtonOptions {
  theme?: 'outline' | 'filled_blue' | 'filled_black'
  size?: 'large' | 'medium' | 'small'
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
  shape?: 'rectangular' | 'pill' | 'circle' | 'square'
  width?: string
}

interface GoogleIdentityApi {
  accounts: {
    id: {
      initialize: (options: {
        client_id: string
        nonce?: string
        callback: (response: GoogleCredentialResponse) => void | Promise<void>
      }) => void
      renderButton: (parent: HTMLElement, options: GoogleButtonOptions) => void
      cancel: () => void
    }
  }
}

declare global {
  interface Window {
    google?: GoogleIdentityApi
  }
}

const GOOGLE_SCRIPT_ID = 'google-identity-services-script'
const GOOGLE_SCRIPT_SRC = 'https://accounts.google.com/gsi/client'

export const getGoogleClientId = () => {
  const clientId = import.meta.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  return typeof clientId === 'string' ? clientId.trim() : ''
}

export const generateGoogleNonce = async () => {
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
  const encodedNonce = new TextEncoder().encode(nonce)
  const hashBuffer = await crypto.subtle.digest('SHA-256', encodedNonce)
  const hashedNonce = Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  return { nonce, hashedNonce }
}

export const loadGoogleIdentityServices = async () => {
  if (window.google?.accounts?.id) return window.google

  const existingScript = document.getElementById(GOOGLE_SCRIPT_ID) as HTMLScriptElement | null
  if (existingScript) {
    await new Promise<void>((resolve, reject) => {
      if (window.google?.accounts?.id) {
        resolve()
        return
      }
      existingScript.addEventListener('load', () => resolve(), { once: true })
      existingScript.addEventListener('error', () => reject(new Error('Google Sign-In could not be loaded.')), { once: true })
    })
    if (window.google?.accounts?.id) return window.google
  }

  await new Promise<void>((resolve, reject) => {
    const script = existingScript || document.createElement('script')
    script.id = GOOGLE_SCRIPT_ID
    script.src = GOOGLE_SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Google Sign-In could not be loaded.'))
    if (!existingScript) document.head.appendChild(script)
  })

  if (!window.google?.accounts?.id) throw new Error('Google Sign-In is unavailable.')
  return window.google
}

export const signInWithGoogleCredential = async (
  supabase: SupabaseClient,
  response: GoogleCredentialResponse,
  nonce: string,
) => {
  if (!response.credential) throw new Error('Google did not return an identity token.')
  return supabase.auth.signInWithIdToken({
    provider: 'google',
    token: response.credential,
    nonce,
  })
}
