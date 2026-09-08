import { useCallback, useEffect, useState } from 'react'
import { supabase, authAvailable } from './supabaseClient'

const PRICE_ID = import.meta.env.VITE_STRIPE_PRICE_ID || ''
const SUCCESS_PATH = '/?checkout=success'
const CANCEL_PATH = '/?checkout=cancelled'

export function useSubscription(session) {
  const [subscription, setSubscription] = useState(null)
  const [subLoading, setSubLoading] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')

  const loadSubscription = useCallback(async () => {
    if (!session) { setSubscription(null); return }
    setSubLoading(true)
    try {
      const { data, error } = await supabase
        .from('stripe_user_subscriptions')
        .select('*')
        .maybeSingle()
      if (error) throw error
      setSubscription(data)
    } catch {
      setSubscription(null)
    } finally {
      setSubLoading(false)
    }
  }, [session])

  useEffect(() => { loadSubscription() }, [loadSubscription])

  const isActive = subscription?.subscription_status === 'active' || subscription?.subscription_status === 'trialing'

  const startCheckout = useCallback(async () => {
    if (!session) return
    setCheckoutLoading(true)
    setCheckoutError('')
    try {
      const origin = window.location.origin
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      const accessToken = currentSession?.access_token
      if (!accessToken) throw new Error('Not authenticated')

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            price_id: PRICE_ID,
            mode: 'subscription',
            success_url: `${origin}${SUCCESS_PATH}`,
            cancel_url: `${origin}${CANCEL_PATH}`,
          }),
        }
      )
      const result = await response.json()
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Checkout failed')
      }
      if (result.url) {
        window.location.href = result.url
      }
    } catch (err) {
      setCheckoutError(err.message || 'Could not start checkout')
    } finally {
      setCheckoutLoading(false)
    }
  }, [session])

  return {
    subscription,
    subLoading,
    isActive,
    startCheckout,
    checkoutLoading,
    checkoutError,
    reload: loadSubscription,
    authAvailable,
  }
}
