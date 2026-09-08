import { useCallback, useEffect, useState } from 'react'
import { supabase, authAvailable } from './supabaseClient'

const SUCCESS_PATH = '/?checkout=success'
const CANCEL_PATH = '/?checkout=cancelled'

export function useSubscription(session) {
  const [subscription, setSubscription] = useState(null)
  const [subLoading, setSubLoading] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')
  const [portalLoading, setPortalLoading] = useState(false)
  const [portalError, setPortalError] = useState('')

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

  const status = subscription?.subscription_status
  const isActive = status === 'active' || status === 'trialing'
  const cancelAtPeriodEnd = Boolean(subscription?.cancel_at_period_end)
  const periodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : null

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

  const manageSubscription = useCallback(async () => {
    if (!session) return
    setPortalLoading(true)
    setPortalError('')
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      const accessToken = currentSession?.access_token
      if (!accessToken) throw new Error('Not authenticated')

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-portal`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ return_url: window.location.origin }),
        }
      )
      const result = await response.json()
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Could not open billing portal')
      }
      if (result.url) {
        window.location.href = result.url
      }
    } catch (err) {
      setPortalError(err.message || 'Could not open billing portal')
    } finally {
      setPortalLoading(false)
    }
  }, [session])

  return {
    subscription,
    subLoading,
    isActive,
    status,
    cancelAtPeriodEnd,
    periodEnd,
    startCheckout,
    checkoutLoading,
    checkoutError,
    manageSubscription,
    portalLoading,
    portalError,
    reload: loadSubscription,
    authAvailable,
  }
}
