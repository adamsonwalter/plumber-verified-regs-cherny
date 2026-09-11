import { StrictMode, useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { supabase, authAvailable } from './supabaseClient'
import { useJobs, JobsScreen, JobDetailScreen, AddToJobModal } from './jobs'
import { useSubscription } from './useSubscription'
import { useEscapeToClose } from './useEscapeToClose'
import './styles.css'

const JOB_TYPES = [
  { id: 'reno', label: 'Residential reno', icon: 'house', description: 'Water, drainage & hot water', tasks: ['water-supply', 'sanitary-drainage', 'heated-water'], tone: 'sand' },
  { id: 'new-build', label: 'New build', icon: 'build', description: 'From rough-in to fit-off', tasks: ['water-supply', 'sanitary-drainage', 'roofing-stormwater', 'heated-water', 'backflow'], tone: 'sea' },
  { id: 'gas-hot-water', label: 'Gas & hot water', icon: 'flame', description: 'Gasfitting & heated water', tasks: ['gasfitting', 'heated-water'], tone: 'rust' },
  { id: 'stormwater', label: 'Stormwater', icon: 'rain', description: 'Roofing, gutters & drainage', tasks: ['roofing-stormwater'], tone: 'blue' },
]

const TASK_LABELS = {
  'water-supply': 'Water supply',
  'sanitary-drainage': 'Sanitary drainage',
  'roofing-stormwater': 'Stormwater',
  gasfitting: 'Gasfitting',
  'heated-water': 'Hot water',
  backflow: 'Backflow',
}

const OBLIGATION_LABELS = {
  technical: 'Technical',
  licensing: 'Licensing',
  documentation: 'Documentation',
  whs: 'WHS',
  product: 'Product',
}

const LOCAL_SAVES_KEY = 'plumber-regs-saved'
const MIGRATED_KEY = 'plumber-regs-saves-migrated'
const THEME_KEY = 'plumber-regs-theme'
const SUPPORT_EMAIL = 'walter@walteradamson.com'

function readTheme() {
  try {
    return localStorage.getItem(THEME_KEY) || 'system'
  } catch {
    return 'system'
  }
}

function readLocalSaved() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_SAVES_KEY) || '[]')
  } catch {
    return []
  }
}

function formatDate(value) {
  if (!value) return 'Not recorded'
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))
}

function trustFor(entry) {
  if (entry.status === 'verified') {
    return { kind: 'verified', label: 'Verified', message: entry.verified?.on ? `Verified on ${formatDate(entry.verified.on)}` : 'Verified' }
  }
  if (entry.status === 'unverified') {
    return { kind: 'warning', label: 'Source changed', message: entry.remedial_note || 'The recorded value was not found on the current source page.' }
  }
  return { kind: 'warning', label: 'Not re-checked', message: entry.remedial_note || 'This entry has not been confirmed against its source.' }
}

function Icon({ name, size = 20 }) {
  const paths = {
    house: <><path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7" /></>,
    build: <><path d="M4 21V9l8-6 8 6v12M2 21h20M8 10h2m4 0h2M8 14h2m4 0h2M10 21v-3h4v3" /></>,
    flame: <path d="M13 3c1 6-5 6-4 11-2-1-3-3-3-3-4 7 0 11 6 11 7 0 10-8 5-13 0 3-2 4-2 4 1-4-2-10-2-10Z" />,
    rain: <><path d="m2 10 10-7 10 7M4 10h16M6 14l-1 3m7-3-1 3m7-3-1 3M8 20l-1 2m7-2-1 2" /></>,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 5 5" /></>,
    bookmark: <path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4.4L5 21V4.5a1 1 0 0 1 1-1Z" />,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" /></>,
    arrow: <path d="M5 12h13M13 6l6 6-6 6" />,
    external: <><path d="M14 5h5v5M19 5l-9 9" /><path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    back: <path d="m15 18-6-6 6-6" />,
    check: <path d="m5 12 4 4L19 6" />,
    user: <><circle cx="12" cy="8" r="4" /><path d="M5.5 21a6.5 6.5 0 0 1 13 0" /></>,
    logout: <path d="M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3M10 17l-5-5 5-5M5 12h12" />,
    folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />,
    plus: <path d="M12 5v14M5 12h14" />,
    trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />,
    lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function App() {
  const [register, setRegister] = useState(null)
  const [activeScreen, setActiveScreen] = useState('find')
  const [query, setQuery] = useState('')
  const [selectedJob, setSelectedJob] = useState(null)
  const [obligations, setObligations] = useState([])
  const [jurisdictions, setJurisdictions] = useState([])
  const [selectedEntry, setSelectedEntry] = useState(null)
  const [savedIds, setSavedIds] = useState(readLocalSaved)
  const [error, setError] = useState('')
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authView, setAuthView] = useState(null)
  const [authError, setAuthError] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [authMessage, setAuthMessage] = useState('')
  const [savesLoading, setSavesLoading] = useState(false)
  const [activeJob, setActiveJob] = useState(null)
  const [showAddToJob, setShowAddToJob] = useState(false)
  const [theme, setTheme] = useState(readTheme)
  const { jobs, jobItems, jobsLoading, createJob, renameJob, deleteJob, addRegToJob, removeRegFromJob } = useJobs(session)
  const subscription = useSubscription(session)
  const [checkoutStatus, setCheckoutStatus] = useState(null)

  useEffect(() => {
    if (theme === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = theme
    try { localStorage.setItem(THEME_KEY, theme) } catch { /* private browsing */ }
  }, [theme])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const status = params.get('checkout')
    if (status === 'success' || status === 'cancelled') {
      setCheckoutStatus(status)
      window.history.replaceState({}, '', window.location.pathname)
      if (status === 'success') subscription.reload()
    }
  }, [])

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (mounted) { setSession(s); setAuthLoading(false) }
    })
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((event, s) => {
      (async () => {
        if (!mounted) return
        setSession(s)
        setAuthLoading(false)
        if (event === 'PASSWORD_RECOVERY') setAuthView('new-password')
        if (s?.user) {
          setSavesLoading(true)
          await migrateLocalSaves(s.user.id)
          await loadRemoteSaves(setSavedIds)
          setSavesLoading(false)
        } else {
          setSavedIds(readLocalSaved())
        }
      })()
    })
    return () => { mounted = false; authSub.unsubscribe() }
  }, [])

  async function migrateLocalSaves(userId) {
    try {
      const migratedKey = `${MIGRATED_KEY}:${userId}`
      const migrated = localStorage.getItem(migratedKey)
      if (migrated) return
      const local = readLocalSaved()
      if (!local.length) { localStorage.setItem(migratedKey, '1'); return }
      const rows = local.map((entryId) => ({ user_id: userId, entry_id: entryId }))
      const { error: upsertError } = await supabase.from('saves').upsert(rows, { onConflict: 'user_id,entry_id', ignoreDuplicates: true })
      if (upsertError) throw upsertError
      localStorage.removeItem(LOCAL_SAVES_KEY)
      localStorage.setItem(migratedKey, '1')
    } catch {
      // Migration is best-effort; local saves are preserved if it fails
    }
  }

  async function loadRemoteSaves(setter) {
    const { data, error: loadError } = await supabase.from('saves').select('entry_id').order('created_at', { ascending: false })
    if (loadError) return
    setter((data || []).map((row) => row.entry_id))
  }

  useEffect(() => {
    fetch('/register.json')
      .then((response) => {
        if (!response.ok) throw new Error('Register unavailable')
        return response.json()
      })
      .then(setRegister)
      .catch(() => setError('The register could not be loaded. Please try again.'))
  }, [])

  useEffect(() => {
    const sync = (event) => {
      if (!session && event.key === LOCAL_SAVES_KEY) setSavedIds(readLocalSaved())
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [session])

  const entries = register?.entries || []
  const filteredEntries = useMemo(() => {
    const search = query.trim().toLowerCase()
    return entries.filter((entry) => {
      const searchable = [entry.claim, entry.value, entry.ui?.title, entry.ui?.ref, entry.ui?.doc, ...(entry.ui?.tags || [])].join(' ').toLowerCase()
      const matchesQuery = !search || searchable.includes(search)
      const matchesJob = !selectedJob || selectedJob.tasks.some((task) => entry.ui?.tradeTasks?.includes(task))
      const matchesObligation = !obligations.length || obligations.includes(entry.ui?.obligation)
      const matchesJurisdiction = !jurisdictions.length || jurisdictions.includes(entry.jurisdiction)
      return matchesQuery && matchesJob && matchesObligation && matchesJurisdiction
    })
  }, [entries, query, selectedJob, obligations, jurisdictions])

  const savedEntries = entries.filter((entry) => savedIds.includes(entry.id))

  // The sidebar badge used to be the literal string "Source checks current"
  // with a green dot, shown unconditionally. On a product whose whole promise
  // is "we tell you when a source has moved", a status light that can only ever
  // read OK is worse than no light: it actively asserts the thing it cannot
  // know. Derive it, the way Settings already derives its counts.
  const degradedCount = entries.filter((entry) => entry.status !== 'verified').length

  const startSearch = useCallback((value = query) => {
    setQuery(value)
    setSelectedJob(null)
    setActiveScreen('results')
  }, [query])

  const chooseJob = useCallback((job) => {
    setSelectedJob(job)
    setQuery('')
    setObligations([])
    setJurisdictions([])
    setActiveScreen('results')
  }, [])

  const toggleSaved = useCallback(async (id) => {
    if (session) {
      const isSaved = savedIds.includes(id)
      setSavedIds((current) => isSaved ? current.filter((savedId) => savedId !== id) : [...current, id])
      if (isSaved) {
        await supabase.from('saves').delete().eq('entry_id', id)
      } else {
        await supabase.from('saves').insert({ entry_id: id })
      }
    } else {
      // Write the buffer here, from this one deliberate action, rather than
      // mirroring `savedIds` from an effect. The effect version fired on every
      // change where `session` was falsy — including the instant of signing
      // out, before `savedIds` had been reset — so an account's saves could be
      // captured into the signed-out buffer and reappear as though they were
      // local. That is how a reg the account no longer held kept showing up.
      const next = savedIds.includes(id) ? savedIds.filter((savedId) => savedId !== id) : [...savedIds, id]
      setSavedIds(next)
      localStorage.setItem(LOCAL_SAVES_KEY, JSON.stringify(next))
    }
  }, [session, savedIds])

  const clearFilters = useCallback(() => {
    setQuery('')
    setSelectedJob(null)
    setObligations([])
    setJurisdictions([])
  }, [])

  async function handleAuthSubmit(email, password, mode, confirmPassword = '') {
    setAuthBusy(true)
    setAuthError('')
    setAuthMessage('')
    try {
      if (mode === 'signup') {
        const { error: signUpError } = await supabase.auth.signUp({ email, password })
        if (signUpError) throw signUpError
        setAuthMessage('Account created. You are now signed in.')
        setAuthView(null)
      } else if (mode === 'signin') {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) throw signInError
        setAuthView(null)
      } else if (mode === 'reset') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
        if (resetError) throw resetError
        setAuthMessage('Password reset link sent. Check your email.')
      } else if (mode === 'new-password') {
        if (password.length < 6) throw new Error('Password must be at least 6 characters.')
        if (password !== confirmPassword) throw new Error('Passwords do not match.')
        const { error: updateError } = await supabase.auth.updateUser({ password })
        if (updateError) throw updateError
        setAuthMessage('Your password has been updated.')
        setAuthView(null)
      }
    } catch (err) {
      setAuthError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setAuthBusy(false)
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    setActiveScreen('find')
    clearFilters()
  }

  if (error) return <main className="loading error-state"><div className="brand-mark">PR</div><h1>Something went wrong</h1><p>{error}</p></main>
  if (!register) return <main className="loading"><div className="brand-mark">PR</div><p>Loading verified register…</p></main>
  if (authLoading) return <main className="loading"><div className="brand-mark">PR</div><p>Loading…</p></main>

  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand brand-button" onClick={() => { setActiveScreen('find'); clearFilters() }} aria-label="Go to Find a reg"><div className="brand-mark">PR</div><div><strong>VIC PlumberRegs</strong><span>Verified field register</span></div></button>
      <div className={`trust-mini ${degradedCount ? 'warn' : ''}`}><span className="trust-dot" /> {degradedCount ? `${degradedCount} source${degradedCount === 1 ? ' needs' : 's need'} review` : 'Source checks current'}</div>
      <nav className="side-nav" aria-label="Main navigation">
        <NavButton active={activeScreen === 'find' || activeScreen === 'results'} onClick={() => { setActiveScreen('find'); clearFilters() }} icon="search" label="Find a reg" />
        <NavButton active={activeScreen === 'saved'} onClick={() => setActiveScreen('saved')} icon="bookmark" label="Saved" count={savedEntries.length} />
        {authAvailable ? <NavButton active={activeScreen === 'jobs' || activeScreen === 'job-detail'} onClick={() => { setActiveScreen('jobs'); setActiveJob(null) }} icon="folder" label="Jobs" count={session ? jobs.length : 0} /> : null}
        <NavButton active={activeScreen === 'settings'} onClick={() => setActiveScreen('settings')} icon="settings" label="Settings" />
      </nav>
      <div className="sidebar-auth">
        {session ? (
          <div className="auth-user">
            <div className="auth-email">{session.user.email}</div>
            <button className="auth-signout" onClick={handleSignOut}><Icon name="logout" size={16} /> Sign out</button>
          </div>
        ) : (
          <div className="auth-guest">
            {authAvailable ? <>
            <button className="auth-signin" onClick={() => { setAuthView('signin'); setAuthError(''); setAuthMessage('') }}><Icon name="user" size={16} /> Sign in</button>
            <button className="auth-signup" onClick={() => { setAuthView('signup'); setAuthError(''); setAuthMessage('') }}>Create account</button>
            </> : null}
          </div>
        )}
      </div>
      <div className="sidebar-footer">Victoria<br /><span>Register {register.register_version}</span></div>
    </aside>

    <main className="main-content">
      {checkoutStatus && <CheckoutBanner status={checkoutStatus} />}
      <header className="mobile-header">
        <button className="mobile-brand brand-button" onClick={() => { setActiveScreen('find'); clearFilters() }} aria-label="Go to Find a reg"><div className="brand-mark">PR</div><div><strong>PlumberRegs</strong><span>VICTORIA</span></div></button>
        <div className="mobile-status">
          {session ? <span className="user-chip"><Icon name="user" size={14} /> {session.user.email}</span> : (authAvailable ? <button className="mobile-signin" onClick={() => { setAuthView('signin'); setAuthError(''); setAuthMessage('') }}>Sign in</button> : null)}
        </div>
      </header>
      {activeScreen === 'find' && <FindScreen entries={entries} query={query} setQuery={setQuery} startSearch={startSearch} chooseJob={chooseJob} session={session} />}
      {activeScreen === 'results' && <ResultsScreen entries={filteredEntries} total={entries.length} query={query} setQuery={setQuery} selectedJob={selectedJob} obligations={obligations} setObligations={setObligations} jurisdictions={jurisdictions} setJurisdictions={setJurisdictions} clearFilters={clearFilters} onOpen={setSelectedEntry} savedIds={savedIds} toggleSaved={toggleSaved} onBack={() => { setActiveScreen('find'); clearFilters() }} />}
      {activeScreen === 'saved' && <SavedScreen entries={savedEntries} allEntries={entries} savedIds={savedIds} onOpen={setSelectedEntry} toggleSaved={toggleSaved} session={session} savesLoading={savesLoading} />}
      {activeScreen === 'jobs' && <JobsScreen jobs={jobs} jobItems={jobItems} allEntries={entries} onOpenJob={(job) => { setActiveJob(job); setActiveScreen('job-detail') }} onCreateJob={createJob} session={session} onShowAuth={(v) => { setAuthView(v); setAuthError(''); setAuthMessage('') }} subscription={subscription} />}
      {activeScreen === 'job-detail' && activeJob && <JobDetailScreen job={activeJob} items={jobItems[activeJob.id] || []} allEntries={entries} onBack={() => { setActiveScreen('jobs'); setActiveJob(null) }} onRemoveReg={removeRegFromJob} onOpenEntry={setSelectedEntry} onRenameJob={renameJob} onDeleteJob={deleteJob} readOnly={!subscription.isActive} />}
      {activeScreen === 'settings' && <SettingsScreen register={register} session={session} onSignOut={handleSignOut} onShowAuth={(v) => { setAuthView(v); setAuthError(''); setAuthMessage('') }} subscription={subscription} theme={theme} setTheme={setTheme} />}
    </main>

    <nav className="mobile-nav" aria-label="Mobile navigation">
      <NavButton active={activeScreen === 'find' || activeScreen === 'results'} onClick={() => { setActiveScreen('find'); clearFilters() }} icon="search" label="Find" />
      <NavButton active={activeScreen === 'saved'} onClick={() => setActiveScreen('saved')} icon="bookmark" label="Saved" count={savedEntries.length} />
      {authAvailable ? <NavButton active={activeScreen === 'jobs' || activeScreen === 'job-detail'} onClick={() => { setActiveScreen('jobs'); setActiveJob(null) }} icon="folder" label="Jobs" count={session ? jobs.length : 0} /> : null}
      <NavButton active={activeScreen === 'settings'} onClick={() => setActiveScreen('settings')} icon="settings" label="Settings" />
    </nav>
    {selectedEntry && <DetailModal entry={selectedEntry} saved={savedIds.includes(selectedEntry.id)} onClose={() => setSelectedEntry(null)} onToggleSaved={() => toggleSaved(selectedEntry.id)} session={session} canManageJobs={subscription.isActive} onAddToJob={() => setShowAddToJob(true)} />}
    {showAddToJob && selectedEntry && <AddToJobModal entry={selectedEntry} jobs={jobs} jobItems={jobItems} onClose={() => setShowAddToJob(false)} onAdd={addRegToJob} onCreateNew={createJob} />}
    {authView && <AuthModal mode={authView} setMode={setAuthView} onSubmit={handleAuthSubmit} onClose={() => { setAuthView(null); setAuthError(''); setAuthMessage('') }} error={authError} busy={authBusy} message={authMessage} />}
  </div>
}

function CheckoutBanner({ status }) {
  const [show, setShow] = useState(true)
  useEffect(() => { const t = setTimeout(() => setShow(false), 6000); return () => clearTimeout(t) }, [])
  if (!show) return null
  return <div className={`checkout-banner ${status}`}>{status === 'success' ? 'Payment successful — your subscription is now active.' : 'Checkout was cancelled. You can try again any time.'}</div>
}

function NavButton({ active, onClick, icon, label, count }) {
  return <button className={`nav-button ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined} onClick={onClick}><span className="nav-icon"><Icon name={icon} size={19} />{count ? <b>{count}</b> : null}</span><span>{label}</span></button>
}

function AuthModal({ mode, setMode, onSubmit, onClose, error, busy, message }) {
  useEscapeToClose(onClose)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    onSubmit(email, password, mode, confirmPassword)
  }

  const titles = { signup: 'Create account', signin: 'Sign in', reset: 'Reset password', 'new-password': 'Set new password' }

  return <div className="modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="detail-modal auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <div className="modal-handle" />
      <div className="modal-header">
        <span className="type-badge">{titles[mode]}</span>
        <button className="close-button" onClick={onClose} aria-label="Close"><Icon name="close" size={20} /></button>
      </div>
      <h1 id="auth-title" className="auth-title">{titles[mode]}</h1>
      {mode === 'reset' ? <p className="auth-subtitle">Enter your email and we'll send you a link to set a new password.</p> : mode === 'new-password' ? <p className="auth-subtitle">Choose a new password for your account.</p> : <p className="auth-subtitle">Use your email and a password to {mode === 'signup' ? 'create an account' : 'sign in'}. The register stays free to browse either way.</p>}
      {message && <div className="auth-message">{message}</div>}
      {error && <div className="auth-error">{error}</div>}
      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="auth-field"><span>Email</span><div className="auth-input-wrap"><Icon name="mail" size={17} /><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email" /></div></label>
        {mode !== 'reset' && <label className="auth-field"><span>Password</span><div className="auth-input-wrap"><Icon name="lock" size={17} /><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" required autoComplete={mode === 'signup' || mode === 'new-password' ? 'new-password' : 'current-password'} /></div></label>}
        {mode === 'new-password' && <label className="auth-field"><span>Confirm password</span><div className="auth-input-wrap"><Icon name="lock" size={17} /><input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Enter it again" required autoComplete="new-password" /></div></label>}
        <button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Please wait…' : titles[mode]}</button>
      </form>
      <div className="auth-links">
        {mode === 'signin' && <button onClick={() => { setMode('signup'); }}>No account? Create one</button>}
        {mode === 'signin' && <button onClick={() => { setMode('reset'); }}>Forgot password?</button>}
        {mode === 'signup' && <button onClick={() => { setMode('signin'); }}>Already have an account? Sign in</button>}
        {mode === 'reset' && <button onClick={() => { setMode('signin'); }}>Back to sign in</button>}
        {mode === 'new-password' && <button onClick={() => { setMode('signin'); }}>Back to sign in</button>}
      </div>
      {mode === 'signup' && <p className="auth-legal">By creating an account you agree to our <a href="/privacy.html" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.</p>}
    </section>
  </div>
}

function FindScreen({ entries, query, setQuery, startSearch, chooseJob, session }) {
  const verifiedCount = entries.filter((entry) => entry.status === 'verified').length
  return <section className="screen find-screen">
    <div className="register-heading"><div className="eyebrow">THE FIELD REGISTER</div><span className="region-label">Victoria + Federal</span></div>
    <h1>The right reg.<br /><em>Back to the job.</em></h1>
    <p className="intro">Plumbing and roofing regulations, with the source to back them up.</p>
    {!session && <p className="marketing-line">Ever priced a job off a reg that had already changed? Every entry here carries a checked date and a link straight to the government source — including material automated tools are blocked from reaching.</p>}
    <form className="hero-search" role="search" onSubmit={(event) => { event.preventDefault(); startSearch() }}>
      <Icon name="search" size={22} /><input type="search" enterKeyHint="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try hot water or AS/NZS 3500" aria-label="Search regulations" /><button type="submit" aria-label="Search regulations"><Icon name="arrow" size={22} /></button>
    </form>
    <div className="quick-heading"><span>What’s the job?</span><button className="browse-all" onClick={startSearch}>All regulations <Icon name="arrow" size={16} /></button></div>
    <div className="job-grid">{JOB_TYPES.map((job) => <button className={`job-card ${job.tone}`} key={job.id} onClick={() => chooseJob(job)}><span className="job-icon"><Icon name={job.icon} size={26} /></span><span className="job-copy"><span className="job-label">{job.label}</span><span className="job-description">{job.description}</span></span><span className="job-arrow"><Icon name="arrow" size={18} /></span></button>)}</div>
    <div className="register-summary"><span><strong>{entries.length}</strong> regulations</span><span><span className="status-dot" />{verifiedCount} verified</span>{verifiedCount < entries.length && <span className="summary-warning">{entries.length - verifiedCount} need review</span>}</div>
    <div className="field-note"><Icon name="check" size={20} /><div><strong>A source behind every result.</strong><p>Check the verification date, read the evidence and open the government source before you rely on a rule.</p></div></div>
  </section>
}

function ResultsScreen({ entries, total, query, setQuery, selectedJob, obligations, setObligations, jurisdictions, setJurisdictions, clearFilters, onOpen, savedIds, toggleSaved, onBack }) {
  function toggle(value, setter) { setter((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]) }
  const hasFilters = query || selectedJob || obligations.length || jurisdictions.length
  return <section className="screen results-screen">
    <button className="back-btn" onClick={onBack}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg> Find a reg</button>
    <div className="section-top"><div><div className="eyebrow">REGISTER SEARCH</div><h1>{selectedJob ? selectedJob.label : 'Matching regulations'}</h1></div><button className="reset-button" onClick={clearFilters}>Reset</button></div>
    <div className="results-search"><Icon name="search" size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} type="search" aria-label="Filter regulations" placeholder="Filter these results" /></div>
    <div className="filter-section"><span className="filter-label">Type</span><div className="filter-scroll">{Object.entries(OBLIGATION_LABELS).map(([value, label]) => <button key={value} aria-pressed={obligations.includes(value)} className={`filter-chip ${obligations.includes(value) ? 'active' : ''}`} onClick={() => toggle(value, setObligations)}>{label}</button>)}</div></div>
    <div className="filter-section"><span className="filter-label">Level</span><div className="filter-scroll">{['VIC', 'Federal'].map((value) => <button key={value} aria-pressed={jurisdictions.includes(value)} className={`filter-chip level ${jurisdictions.includes(value) ? 'active' : ''}`} onClick={() => toggle(value, setJurisdictions)}>{value === 'VIC' ? 'Victoria' : value}</button>)}</div></div>
    <div className="results-meta"><strong>{entries.length} {entries.length === 1 ? 'result' : 'results'}</strong><span>{hasFilters ? `of ${total} entries` : 'All register entries'}</span></div>
    <div className="results-list">{entries.length ? entries.map((entry) => <RegCard key={entry.id} entry={entry} onOpen={onOpen} saved={savedIds.includes(entry.id)} onToggleSaved={toggleSaved} />) : <div className="empty-state"><div className="empty-number">0</div><h2>No matching regulations</h2><p>Try clearing a filter or searching another term.</p><button onClick={clearFilters}>Show all entries</button></div>}</div>
  </section>
}

function RegCard({ entry, onOpen, saved, onToggleSaved }) {
  const trust = trustFor(entry)
  const meta = OBLIGATION_LABELS[entry.ui?.obligation] || entry.ui?.obligation || 'Other'
  return <article className="reg-card" onClick={() => onOpen(entry)}><div className="card-top"><span className={`type-badge ${entry.ui?.obligation || ''}`}>{meta}</span><button className={`save-button ${saved ? 'saved' : ''}`} onClick={(event) => { event.stopPropagation(); onToggleSaved(entry.id) }} aria-label={saved ? 'Remove from saved' : 'Save regulation'}><Icon name="bookmark" size={18} /></button></div><h2><button className="reg-open" onClick={() => onOpen(entry)}>{entry.ui?.title || entry.claim}</button></h2><p className="card-value">{entry.value}</p><div className="card-bottom"><span className={`status ${trust.kind}`}><span className="status-dot" />{trust.message}</span><span className="card-ref">{entry.ui?.ref}</span></div></article>
}

function SavedScreen({ entries, allEntries, savedIds, onOpen, toggleSaved, session, savesLoading }) {
  const entryMap = useMemo(() => new Map(allEntries.map((e) => [e.id, e])), [allEntries])
  const removedIds = savedIds.filter((id) => !entryMap.has(id))

  return <section className="screen saved-screen">
    <div className="eyebrow">{session ? 'SYNCED TO YOUR ACCOUNT' : 'YOUR DEVICE'}</div>
    <h1>Saved regulations</h1>
    <p className="intro">{session ? 'Your saved regs follow you to any device you sign in on.' : 'Saved on this device. Sign in and they follow you to any device.'}</p>
    {savesLoading && <p className="saves-loading">Loading your saves…</p>}
    {entries.length ? <div className="results-list">{entries.map((entry) => <RegCard key={entry.id} entry={entry} onOpen={onOpen} saved={savedIds.includes(entry.id)} onToggleSaved={toggleSaved} />)}</div> : !savesLoading && <div className="empty-state saved-empty"><div className="empty-icon"><Icon name="bookmark" size={28} /></div><h2>Nothing saved yet</h2><p>Tap the bookmark on any reg to keep it here.</p></div>}
    {removedIds.length > 0 && <div className="removed-saves"><h3>No longer in the register</h3>{removedIds.map((id) => <div key={id} className="removed-row"><span>{id}</span><button onClick={() => toggleSaved(id)}>Remove</button></div>)}</div>}
  </section>
}

function SettingsScreen({ register, session, onSignOut, onShowAuth, subscription, theme, setTheme }) {
  const subStatus = subscription.subLoading ? 'Checking…' : subscription.isActive ? (subscription.cancelAtPeriodEnd ? `Cancels ${formatDate(subscription.periodEnd)}` : 'Active') : subscription.status === 'canceled' || subscription.status === 'unpaid' || subscription.status === 'past_due' ? 'Lapsed' : 'No subscription'
  return <section className="screen settings-screen">
    <div className="eyebrow">REGISTER INFO</div>
    <h1>Settings</h1>
    <p className="intro">You cannot edit the register here. Every source is re-checked weekly and the results are published back to the app.</p>
    <div className="settings-card">
      <SettingRow label="Register version" value={register.register_version} />
      <SettingRow label="Regs" value={`${register.entries.length}`} />
      <SettingRow label="Last checked" value={formatDate(register.last_run?.on || register.last_agent_run)} />
      <SettingRow label="Check result" value={`${register.last_run?.counts?.verified || 0} verified`} good />
    </div>
    <div className="settings-card" style={{ marginTop: '18px' }}>
      <div className="setting-row">
        <span>Appearance</span>
        <div className="theme-toggle" role="group" aria-label="Theme">
          {['system', 'light', 'dark'].map((option) => (
            <button key={option} className={theme === option ? 'active' : ''} aria-pressed={theme === option} onClick={() => setTheme(option)}>
              {option === 'system' ? 'System' : option === 'light' ? 'Light' : 'Dark'}
            </button>
          ))}
        </div>
      </div>
    </div>
    <div className="settings-card" style={{ marginTop: '18px' }}>
      {session ? (
        <div className="setting-row setting-account">
          <div className="account-info"><span className="account-label">Signed in as</span><strong>{session.user.email}</strong></div>
          <button className="auth-signout" onClick={onSignOut}><Icon name="logout" size={16} /> Sign out</button>
        </div>
      ) : (
        <div className="setting-row setting-account">
          <div className="account-info"><span className="account-label">Account</span><strong>Not signed in</strong><small>Sign in and your saved regs follow you to any device</small></div>
          {authAvailable ? <div className="account-actions"><button className="auth-signin" onClick={() => onShowAuth('signin')}><Icon name="user" size={16} /> Sign in</button><button className="auth-signup" onClick={() => onShowAuth('signup')}>Create account</button></div> : <small>Account features are unavailable in this build.</small>}
        </div>
      )}
      {session && (
        <div className="setting-row subscription-row">
          <span>Subscription</span>
          <strong className={subscription.isActive ? 'good' : ''}>{subStatus}</strong>
        </div>
      )}
      {session && subscription.isActive && (
        <div className="subscription-cta">
          <p>{subscription.cancelAtPeriodEnd ? `Your access remains active until ${formatDate(subscription.periodEnd)}.` : 'Manage billing, payment method, or cancellation in Stripe.'}</p>
          {subscription.portalError && <div className="auth-error">{subscription.portalError}</div>}
          <button className="checkout-btn secondary" onClick={subscription.manageSubscription} disabled={subscription.portalLoading}>
            {subscription.portalLoading ? 'Opening…' : 'Manage subscription'}
          </button>
        </div>
      )}
      {session && !subscription.isActive && !subscription.subLoading && (
        <div className="subscription-cta">
          <p>{subscription.status === 'canceled' || subscription.status === 'unpaid' || subscription.status === 'past_due' ? 'Your jobs are retained and available to read. Resubscribe to edit them.' : 'Unlock Jobs to group regs by project.'}</p>
          {subscription.checkoutError && <div className="auth-error">{subscription.checkoutError}</div>}
          <button className="checkout-btn" onClick={subscription.startCheckout} disabled={subscription.checkoutLoading}>
            {subscription.checkoutLoading ? 'Redirecting…' : 'Subscribe now'}
          </button>
        </div>
      )}
    </div>
    <div className="settings-callout"><span className="trust-dot" /><div><strong>Weekly source checks</strong><p>Each entry is checked on its own. If a source changes or goes offline, that entry shows a warning.</p></div></div>

    <div className="eyebrow" style={{ marginTop: '36px' }}>SUPPORT</div>
    <div className="settings-card">
      <div className="setting-row">
        <span>Found a problem, or a reg that looks wrong?</span>
        <a className="support-link" href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('VIC PlumberRegs')}`}><Icon name="mail" size={15} /> Email support</a>
      </div>
      <div className="faq-item"><details><summary>How is a "verified" date worked out?</summary><p>Each entry's source page is checked on a weekly schedule against the value recorded here. If the value still matches, the entry is marked verified with that date. If it doesn't, or the page can't be reached, the entry shows a warning instead of a false "verified" tag.</p></details></div>
      <div className="faq-item"><details><summary>Why does this exist instead of just searching the standard myself?</summary><p>You can always read the primary source — the link is on every entry. What's hard to do by hand is re-check every clause you rely on, every week, and notice the moment one changes. That's the part this register automates. Some of the underlying government content (BPC) blocks automated access entirely, so even that re-check has to be done deliberately, not scraped.</p></details></div>
      <div className="faq-item"><details><summary>What if I disagree with a listed value?</summary><p>Open the entry and follow "Open government source" — that page is the actual authority, not this app. If you think the register has it wrong, email support with the entry and we'll re-check it.</p></details></div>
      <div className="setting-row"><span>How we handle your information</span><a className="support-link" href="/privacy.html" target="_blank" rel="noopener noreferrer">Privacy Policy</a></div>
    </div>
  </section>
}

function SettingRow({ label, value, good }) { return <div className="setting-row"><span>{label}</span><strong className={good ? 'good' : ''}>{value}</strong></div> }

function DetailModal({ entry, saved, onClose, onToggleSaved, session, canManageJobs, onAddToJob }) {
  useEscapeToClose(onClose)
  const [sourceOverlay, setSourceOverlay] = useState(false)
  const trust = trustFor(entry)
  const source = entry.human_url || entry.source_url
  const isStandalone = typeof navigator !== 'undefined' && navigator.standalone === true
  const openSource = (event) => {
    if (isStandalone) {
      event.preventDefault()
      setSourceOverlay(true)
    }
  }
  return <div className="modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title"><div className="modal-handle" /><div className="modal-header"><span className={`type-badge ${entry.ui?.obligation || ''}`}>{OBLIGATION_LABELS[entry.ui?.obligation] || entry.ui?.obligation || 'Other'}</span><button className="close-button" onClick={onClose} aria-label="Close"><Icon name="close" size={20} /></button></div><h1 id="detail-title">{entry.ui?.title || entry.claim}</h1><div className={`trust-panel ${trust.kind}`}><span className="status-dot" /><div><strong>{trust.kind === 'verified' ? 'Verified source' : trust.label}</strong><p>{trust.message}</p>{trust.kind !== 'verified' && entry.remedial_note ? <small>{entry.remedial_note}</small> : null}</div></div><div className="detail-grid"><div><span className="detail-label">Value</span><p className="detail-value">{entry.value}</p></div><div><span className="detail-label">Where to find it</span><p className="detail-value detail-ref">{entry.ui?.ref}<br /><span>{entry.ui?.doc}</span></p></div></div>{trust.kind === 'verified' && entry.verified?.quote ? <div className="quote-block"><span className="detail-label">Supporting quote</span><blockquote>“{entry.verified.quote}”</blockquote></div> : null}<div className="detail-date"><span>Last confirmed</span><strong>{trust.kind === 'verified' ? formatDate(entry.verified?.on) : 'Not confirmed as current'}</strong></div><div className="modal-actions">{session && canManageJobs && <button className="modal-save job-add-btn" onClick={onAddToJob}><Icon name="folder" size={18} />Add to job</button>}<button className={`modal-save ${saved ? 'saved' : ''}`} onClick={onToggleSaved}><Icon name="bookmark" size={18} />{saved ? 'Saved' : 'Save'}</button><a className="source-link" href={source} target="_blank" rel="noopener noreferrer" onClick={openSource}>Open government source <Icon name="external" size={16} /></a></div>{sourceOverlay && <div className="source-overlay" role="dialog" aria-label="Government source"><div className="source-overlay-card"><button className="close-button" onClick={() => setSourceOverlay(false)} aria-label="Close source overlay"><Icon name="close" size={20} /></button><h2>Open government source</h2><p>The source will open outside the app. Return here when you are done.</p><a className="checkout-btn" href={source} target="_blank" rel="noopener noreferrer">Open source <Icon name="external" size={16} /></a></div></div>}</section></div>
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
