import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import {
  generateGoogleNonce,
  getGoogleClientId,
  loadGoogleIdentityServices,
  signInWithGoogleCredential,
} from '../../lib/googleIdentity'

interface GoogleSignInButtonProps {
  onError?: (message: string) => void
  onLoadingChange?: (loading: boolean) => void
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
  className?: string
}

export default function GoogleSignInButton({
  onError,
  onLoadingChange,
  text = 'continue_with',
  className = '',
}: GoogleSignInButtonProps) {
  const buttonRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [available, setAvailable] = useState(true)

  useEffect(() => {
    let cancelled = false

    const setBusy = (value: boolean) => {
      if (!cancelled) {
        setLoading(value)
        onLoadingChange?.(value)
      }
    }

    const initialize = async () => {
      const clientId = getGoogleClientId()
      if (!clientId) {
        setAvailable(false)
        setBusy(false)
        onError?.('Google Sign-In is not configured. Add NEXT_PUBLIC_GOOGLE_CLIENT_ID to the environment.')
        return
      }

      if (!buttonRef.current) return
      try {
        const google = await loadGoogleIdentityServices()
        const { nonce, hashedNonce } = await generateGoogleNonce()
        if (cancelled || !buttonRef.current) return

        google.accounts.id.initialize({
          client_id: clientId,
          nonce: hashedNonce,
          callback: async (response) => {
            setBusy(true)
            try {
              const { error } = await signInWithGoogleCredential(supabase, response, nonce)
              if (error) throw error
            } catch (error) {
              onError?.(error instanceof Error ? error.message : 'Google Sign-In failed. Please try again.')
              google.accounts.id.cancel()
              if (!cancelled) void initialize()
            } finally {
              setBusy(false)
            }
          },
        })
        buttonRef.current.replaceChildren()
        google.accounts.id.renderButton(buttonRef.current, {
          theme: 'outline',
          size: 'large',
          text,
          shape: 'rectangular',
          width: '400',
        })
        setAvailable(true)
        setBusy(false)
      } catch (error) {
        setAvailable(false)
        setBusy(false)
        onError?.(error instanceof Error ? error.message : 'Google Sign-In could not be initialized.')
      }
    }

    void initialize()
    return () => {
      cancelled = true
      window.google?.accounts?.id.cancel()
    }
  }, [onError, onLoadingChange, text])

  return (
    <div className={`relative flex min-h-11 w-full justify-center ${className}`} aria-busy={loading}>
      {loading && <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-[#193364] text-sm font-semibold text-white">Connecting to Google…</span>}
      <div ref={buttonRef} className={`w-full justify-items-center ${!available ? 'hidden' : ''}`} aria-label="Continue with Google" />
    </div>
  )
}
