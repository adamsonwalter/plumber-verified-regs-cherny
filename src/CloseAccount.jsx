import { useState } from 'react'
import { supabase } from './supabaseClient'

/**
 * Settings → Close account. Two deliberate steps, then the delete-account
 * function cancels billing first and deletes the account second; if billing
 * cannot be cancelled, nothing is deleted.
 */
export function CloseAccount({ hasBilling, onClosed }) {
  const [step, setStep] = useState('idle') // idle | confirm | busy | done
  const [error, setError] = useState('')

  async function closeAccount() {
    setStep('busy'); setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not signed in')
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ confirm: true }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.closed) throw new Error(result.error || 'Could not close your account')
      setStep('done')
    } catch (e) {
      setError(e.message)
      setStep('confirm')
    }
  }

  if (step === 'done') {
    return <div className="settings-card close-account">
      <strong>Your account is closed.</strong>
      <p>{hasBilling ? 'Billing is cancelled and ' : ''}your saved regs and jobs are deleted. The register is still free to use.</p>
      <button className="cancel-btn" onClick={onClosed}>Done</button>
    </div>
  }

  return <div className="settings-card close-account">
    <strong>Close account</strong>
    {step === 'idle' && <>
      <p>Deletes your account, saved regs and jobs.</p>
      <button className="danger-btn" onClick={() => setStep('confirm')}>Close my account</button>
    </>}
    {(step === 'confirm' || step === 'busy') && <>
      <p><strong>This can't be undone.</strong> Your saved regs and jobs are deleted straight away.{hasBilling ? ' Billing for Jobs is cancelled now, with no refund for the rest of this period.' : ''} Download any job records you want to keep first.</p>
      {error && <div className="auth-error">{error}</div>}
      <div className="confirm-actions">
        <button className="danger-btn" onClick={closeAccount} disabled={step === 'busy'}>{step === 'busy' ? 'Closing…' : 'Yes, close my account'}</button>
        <button className="cancel-btn" onClick={() => { setStep('idle'); setError('') }} disabled={step === 'busy'}>Keep it</button>
      </div>
    </>}
  </div>
}
