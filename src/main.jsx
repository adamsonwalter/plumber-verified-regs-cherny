import { useEffect, useMemo, useState } from 'react'
import './styles.css'

const JOBS = [
  { id: 'reno', label: 'Residential Reno', icon: 'RR', tasks: ['water-supply', 'sanitary-drainage', 'heated-water'], tone: 'sand' },
  { id: 'new-build', label: 'New Build', icon: 'NB', tasks: ['water-supply', 'sanitary-drainage', 'roofing-stormwater', 'heated-water', 'backflow'], tone: 'sea' },
  { id: 'gas-hot-water', label: 'Gas + Hot Water', icon: 'GH', tasks: ['gasfitting', 'heated-water'], tone: 'rust' },
  { id: 'stormwater', label: 'Stormwater', icon: 'SW', tasks: ['roofing-stormwater'], tone: 'blue' },
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

function readSaved() {
  try {
    return JSON.parse(localStorage.getItem('plumber-regs-saved') || '[]')
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
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 5 5" /></>,
    bookmark: <path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4.4L5 21V4.5a1 1 0 0 1 1-1Z" />,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" /></>,
    arrow: <path d="M5 12h13M13 6l6 6-6 6" />,
    external: <><path d="M14 5h5v5M19 5l-9 9" /><path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    back: <path d="m15 18-6-6 6-6" />,
    check: <path d="m5 12 4 4L19 6" />,
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
  const [savedIds, setSavedIds] = useState(readSaved)
  const [error, setError] = useState('')

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
    localStorage.setItem('plumber-regs-saved', JSON.stringify(savedIds))
  }, [savedIds])

  useEffect(() => {
    const sync = (event) => {
      if (event.key === 'plumber-regs-saved') setSavedIds(readSaved())
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

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

  function startSearch(value = query) {
    setQuery(value)
    setSelectedJob(null)
    setActiveScreen('results')
  }

  function chooseJob(job) {
    setSelectedJob(job)
    setQuery('')
    setObligations([])
    setJurisdictions([])
    setActiveScreen('results')
  }

  function toggleSaved(id) {
    setSavedIds((current) => current.includes(id) ? current.filter((savedId) => savedId !== id) : [...current, id])
  }

  function clearFilters() {
    setQuery('')
    setSelectedJob(null)
    setObligations([])
    setJurisdictions([])
  }

  if (error) return <main className="loading error-state"><div className="brand-mark">PR</div><h1>Something went wrong</h1><p>{error}</p></main>
  if (!register) return <main className="loading"><div className="brand-mark">PR</div><p>Loading verified register…</p></main>

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">PR</div><div><strong>VIC PlumberRegs</strong><span>Verified field register</span></div></div>
      <div className="trust-mini"><span className="trust-dot" /> Source checks current</div>
      <nav className="side-nav" aria-label="Main navigation">
        <NavButton active={activeScreen === 'find' || activeScreen === 'results'} onClick={() => { setActiveScreen('find'); clearFilters() }} icon="search" label="Find a reg" />
        <NavButton active={activeScreen === 'saved'} onClick={() => setActiveScreen('saved')} icon="bookmark" label="Saved" count={savedEntries.length} />
        <NavButton active={activeScreen === 'settings'} onClick={() => setActiveScreen('settings')} icon="settings" label="Settings" />
      </nav>
      <div className="sidebar-footer">Built for licensed trades<br /><span>Victoria · Register {register.register_version}</span></div>
    </aside>

    <main className="main-content">
      <header className="mobile-header"><div className="brand-mark">PR</div><div className="mobile-status"><span className="trust-dot" /> Current register</div></header>
      {activeScreen === 'find' && <FindScreen entries={entries} query={query} setQuery={setQuery} startSearch={startSearch} chooseJob={chooseJob} />}
      {activeScreen === 'results' && <ResultsScreen entries={filteredEntries} total={entries.length} query={query} setQuery={setQuery} selectedJob={selectedJob} obligations={obligations} setObligations={setObligations} jurisdictions={jurisdictions} setJurisdictions={setJurisdictions} clearFilters={clearFilters} onOpen={setSelectedEntry} savedIds={savedIds} toggleSaved={toggleSaved} />}
      {activeScreen === 'saved' && <SavedScreen entries={savedEntries} onOpen={setSelectedEntry} savedIds={savedIds} toggleSaved={toggleSaved} />}
      {activeScreen === 'settings' && <SettingsScreen register={register} />}
    </main>

    <nav className="mobile-nav" aria-label="Mobile navigation">
      <NavButton active={activeScreen === 'find' || activeScreen === 'results'} onClick={() => { setActiveScreen('find'); clearFilters() }} icon="search" label="Find" />
      <NavButton active={activeScreen === 'saved'} onClick={() => setActiveScreen('saved')} icon="bookmark" label="Saved" count={savedEntries.length} />
      <NavButton active={activeScreen === 'settings'} onClick={() => setActiveScreen('settings')} icon="settings" label="Settings" />
    </nav>
    {selectedEntry && <DetailModal entry={selectedEntry} saved={savedIds.includes(selectedEntry.id)} onClose={() => setSelectedEntry(null)} onToggleSaved={() => toggleSaved(selectedEntry.id)} />}
  </div>
}

function NavButton({ active, onClick, icon, label, count }) {
  return <button className={`nav-button ${active ? 'active' : ''}`} onClick={onClick}><span className="nav-icon"><Icon name={icon} size={19} />{count ? <b>{count}</b> : null}</span><span>{label}</span></button>
}

function FindScreen({ entries, query, setQuery, startSearch, chooseJob }) {
  return <section className="screen find-screen">
    <div className="eyebrow">FIELD REGISTER / VICTORIA</div>
    <h1>Find a regulation<br /><em>before you start.</em></h1>
    <p className="intro">Search the verified register for the rule behind the work. Each result shows exactly when its source was last checked.</p>
    <form className="hero-search" onSubmit={(event) => { event.preventDefault(); startSearch() }}>
      <Icon name="search" size={21} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a clause, standard or task" aria-label="Search regulations" /><button type="submit">Search</button>
    </form>
    <div className="quick-heading"><span>Start with a job</span><span>{entries.length} verified entries</span></div>
    <div className="job-grid">{JOBS.map((job) => <button className={`job-card ${job.tone}`} key={job.id} onClick={() => chooseJob(job)}><span className="job-icon">{job.icon}</span><span className="job-label">{job.label}</span><span className="job-arrow"><Icon name="arrow" size={17} /></span></button>)}</div>
    <div className="field-note"><span className="note-line" /><div><strong>Trust the status, not the colour.</strong><p>Only entries marked Verified have passed their latest source check. Warnings mean you should open the government page before relying on the value.</p></div></div>
  </section>
}

function ResultsScreen({ entries, total, query, setQuery, selectedJob, obligations, setObligations, jurisdictions, setJurisdictions, clearFilters, onOpen, savedIds, toggleSaved }) {
  function toggle(value, setter) { setter((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]) }
  const hasFilters = query || selectedJob || obligations.length || jurisdictions.length
  return <section className="screen results-screen">
    <div className="section-top"><div><div className="eyebrow">REGISTER SEARCH</div><h1>{selectedJob ? selectedJob.label : 'Matching regulations'}</h1></div><button className="reset-button" onClick={clearFilters}>Reset</button></div>
    <div className="results-search"><Icon name="search" size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter these results" /></div>
    <div className="filter-section"><span className="filter-label">Type</span><div className="filter-scroll">{Object.entries(OBLIGATION_LABELS).map(([value, label]) => <button key={value} className={`filter-chip ${obligations.includes(value) ? 'active' : ''}`} onClick={() => toggle(value, setObligations)}>{label}</button>)}</div></div>
    <div className="filter-section"><span className="filter-label">Level</span><div className="filter-scroll">{['VIC', 'Federal'].map((value) => <button key={value} className={`filter-chip level ${jurisdictions.includes(value) ? 'active' : ''}`} onClick={() => toggle(value, setJurisdictions)}>{value === 'VIC' ? 'Victoria' : value}</button>)}</div></div>
    <div className="results-meta"><strong>{entries.length} {entries.length === 1 ? 'result' : 'results'}</strong><span>{hasFilters ? `of ${total} entries` : 'All register entries'}</span></div>
    <div className="results-list">{entries.length ? entries.map((entry) => <RegCard key={entry.id} entry={entry} onOpen={onOpen} saved={savedIds.includes(entry.id)} onToggleSaved={toggleSaved} />) : <div className="empty-state"><div className="empty-number">0</div><h2>No matching regulations</h2><p>Try clearing a filter or searching another term.</p><button onClick={clearFilters}>Show all entries</button></div>}</div>
  </section>
}

function RegCard({ entry, onOpen, saved, onToggleSaved }) {
  const trust = trustFor(entry)
  const meta = OBLIGATION_LABELS[entry.ui?.obligation] || entry.ui?.obligation || 'Other'
  return <article className="reg-card" onClick={() => onOpen(entry)}><div className="card-top"><span className={`type-badge ${entry.ui?.obligation || ''}`}>{meta}</span><button className={`save-button ${saved ? 'saved' : ''}`} onClick={(event) => { event.stopPropagation(); onToggleSaved(entry.id) }} aria-label={saved ? 'Remove from saved' : 'Save regulation'}><Icon name="bookmark" size={18} /></button></div><h2>{entry.ui?.title || entry.claim}</h2><p className="card-value">{entry.value}</p><div className="card-bottom"><span className={`status ${trust.kind}`}><span className="status-dot" />{trust.message}</span><span className="card-ref">{entry.ui?.ref}</span></div></article>
}

function SavedScreen({ entries, onOpen, savedIds, toggleSaved }) {
  return <section className="screen saved-screen"><div className="eyebrow">YOUR DEVICE</div><h1>Saved regulations</h1><p className="intro">Keep the rules you return to on the job within reach.</p>{entries.length ? <div className="results-list">{entries.map((entry) => <RegCard key={entry.id} entry={entry} onOpen={onOpen} saved={savedIds.includes(entry.id)} onToggleSaved={toggleSaved} />)}</div> : <div className="empty-state saved-empty"><div className="empty-icon"><Icon name="bookmark" size={28} /></div><h2>Nothing saved yet</h2><p>Tap the bookmark on any regulation to keep it here.</p></div>}</section>
}

function SettingsScreen({ register }) {
  return <section className="screen settings-screen"><div className="eyebrow">REGISTER INFO</div><h1>Settings</h1><p className="intro">The register is read-only in this app. It is refreshed by a separate source-checking process.</p><div className="settings-card"><SettingRow label="Register version" value={register.register_version} /><SettingRow label="Entries" value={`${register.entries.length} regulations`} /><SettingRow label="Last checked" value={formatDate(register.last_run?.on || register.last_agent_run)} /><SettingRow label="Check result" value={`${register.last_run?.counts?.verified || 0} verified`} good /></div><div className="settings-callout"><span className="trust-dot" /><div><strong>Weekly source checks</strong><p>Every entry keeps its own status. A changed or unreachable source is shown as a warning, never as current.</p></div></div></section>
}

function SettingRow({ label, value, good }) { return <div className="setting-row"><span>{label}</span><strong className={good ? 'good' : ''}>{value}</strong></div> }

function DetailModal({ entry, saved, onClose, onToggleSaved }) {
  const trust = trustFor(entry)
  const source = entry.human_url || entry.source_url
  return <div className="modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title"><div className="modal-handle" /><div className="modal-header"><span className={`type-badge ${entry.ui?.obligation || ''}`}>{OBLIGATION_LABELS[entry.ui?.obligation] || entry.ui?.obligation || 'Other'}</span><button className="close-button" onClick={onClose} aria-label="Close"><Icon name="close" size={20} /></button></div><h1 id="detail-title">{entry.ui?.title || entry.claim}</h1><div className={`trust-panel ${trust.kind}`}><span className="status-dot" /><div><strong>{trust.kind === 'verified' ? 'Verified source' : trust.label}</strong><p>{trust.message}</p>{trust.kind !== 'verified' && entry.remedial_note ? <small>{entry.remedial_note}</small> : null}</div></div><div className="detail-grid"><div><span className="detail-label">Value</span><p className="detail-value">{entry.value}</p></div><div><span className="detail-label">Where to find it</span><p className="detail-value detail-ref">{entry.ui?.ref}<br /><span>{entry.ui?.doc}</span></p></div></div>{trust.kind === 'verified' && entry.verified?.quote ? <div className="quote-block"><span className="detail-label">Supporting quote</span><blockquote>“{entry.verified.quote}”</blockquote></div> : null}<div className="detail-date"><span>Last confirmed</span><strong>{trust.kind === 'verified' ? formatDate(entry.verified?.on) : 'Not confirmed as current'}</strong></div><div className="modal-actions"><button className={`modal-save ${saved ? 'saved' : ''}`} onClick={onToggleSaved}><Icon name="bookmark" size={18} />{saved ? 'Saved' : 'Save'}</button><a className="source-link" href={source} target="_blank" rel="noopener noreferrer">Open government source <Icon name="external" size={16} /></a></div></section></div>
}

export default App
