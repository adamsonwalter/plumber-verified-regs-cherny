import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'

export function useJobs(session) {
  const [jobs, setJobs] = useState([])
  const [jobItems, setJobItems] = useState({})
  const [jobsLoading, setJobsLoading] = useState(false)

  async function loadJobs() {
    if (!session) { setJobs([]); setJobItems({}); return }
    setJobsLoading(true)
    try {
      const { data: jobRows, error: jobsError } = await supabase.from('jobs').select('*').order('created_at', { ascending: false })
      if (jobsError) throw jobsError
      const { data: itemRows, error: itemsError } = await supabase.from('job_items').select('id, job_id, entry_id').order('created_at', { ascending: false })
      if (itemsError) throw itemsError
      const itemsMap = {}
      for (const item of itemRows || []) {
        if (!itemsMap[item.job_id]) itemsMap[item.job_id] = []
        itemsMap[item.job_id].push(item)
      }
      setJobs(jobRows || [])
      setJobItems(itemsMap)
    } catch {
      // best-effort
    } finally {
      setJobsLoading(false)
    }
  }

  useEffect(() => { loadJobs() }, [session])

  async function createJob(name, note) {
    const { data, error } = await supabase.rpc('create_job', { p_name: name, p_note: note || null })
    if (error) throw error
    setJobs((current) => [data, ...current])
    setJobItems((current) => ({ ...current, [data.id]: [] }))
    return data
  }

  async function renameJob(jobId, name, note) {
    const { data, error } = await supabase.from('jobs').update({ name, note: note || null }).eq('id', jobId).select().single()
    if (error) throw error
    setJobs((current) => current.map((j) => j.id === jobId ? data : j))
  }

  async function deleteJob(jobId) {
    const { error } = await supabase.from('jobs').delete().eq('id', jobId)
    if (error) throw error
    setJobs((current) => current.filter((j) => j.id !== jobId))
    setJobItems((current) => {
      const next = { ...current }
      delete next[jobId]
      return next
    })
  }

  async function addRegToJob(jobId, entryId) {
    const { error } = await supabase.from('job_items').insert({ job_id: jobId, entry_id: entryId })
    if (error && error.code !== '23505') throw error
    setJobItems((current) => {
      const existing = current[jobId] || []
      if (existing.some((item) => item.entry_id === entryId)) return current
      return { ...current, [jobId]: [{ id: 'temp', job_id: jobId, entry_id: entryId }, ...existing] }
    })
    await loadJobs()
  }

  async function removeRegFromJob(jobId, entryId) {
    const { error } = await supabase.from('job_items').delete().eq('job_id', jobId).eq('entry_id', entryId)
    if (error) throw error
    setJobItems((current) => ({
      ...current,
      [jobId]: (current[jobId] || []).filter((item) => item.entry_id !== entryId),
    }))
  }

  return { jobs, jobItems, jobsLoading, loadJobs, createJob, renameJob, deleteJob, addRegToJob, removeRegFromJob }
}

export function JobsScreen({ jobs, jobItems, allEntries, onOpenJob, onCreateJob, session, onShowAuth, subscription }) {
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const entryMap = useMemo(() => new Map(allEntries.map((e) => [e.id, e])), [allEntries])

  async function handleCreate(event) {
    event.preventDefault()
    setBusy(true); setErr('')
    try {
      await onCreateJob(name, note)
      setName(''); setNote(''); setShowCreate(false)
    } catch (e) {
      setErr(e.message || 'Could not create job')
    } finally {
      setBusy(false)
    }
  }

  if (!session) {
    return <section className="screen jobs-screen">
      <div className="eyebrow">YOUR ACCOUNT</div>
      <h1>Jobs</h1>
      <p className="intro">Group saved regs into named jobs — "Bennett St reno" — so you can pull up exactly the rules you need for each project.</p>
      <div className="jobs-locked">
        <div className="locked-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg></div>
        <h2>Sign in to use Jobs</h2>
        <p>Jobs are a paid feature. Create an account or sign in to start grouping regs by project.</p>
        <div className="locked-actions">
          <button className="auth-signin" onClick={() => onShowAuth('signin')}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M5.5 21a6.5 6.5 0 0 1 13 0" /></svg> Sign in</button>
          <button className="auth-signup" onClick={() => onShowAuth('signup')}>Create account</button>
        </div>
      </div>
    </section>
  }

  const canEdit = subscription.isActive

  return <section className="screen jobs-screen">
    <div className="eyebrow">YOUR ACCOUNT</div>
    <div className="section-top">
      <div><h1>Jobs</h1></div>
      {canEdit ? <button className="add-job-btn" onClick={() => setShowCreate(true)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg> New job</button> : <span className="read-only-badge">Read only</span>} 
    </div>
    <p className="intro">Group saved regs into named jobs so you can pull up exactly the rules you need for each project.</p>
    {!subscription.subLoading && !canEdit && <div className="jobs-readonly-notice"><strong>Your subscription is not active.</strong> Existing jobs are still available to view. Resubscribe to create or edit jobs. <button className="inline-checkout" onClick={subscription.startCheckout} disabled={subscription.checkoutLoading}>{subscription.checkoutLoading ? 'Opening…' : 'Resubscribe'}</button></div>}

    {showCreate && (
      <form className="job-create-card" onSubmit={handleCreate}>
        <h3>Create a job</h3>
        {err && <div className="auth-error">{err}</div>}
        <label className="auth-field"><span>Job name</span><div className="auth-input-wrap"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bennett St reno" required autoFocus /></div></label>
        <label className="auth-field"><span>Note (optional)</span><div className="auth-input-wrap"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything useful about this job" /></div></label>
        <div className="job-create-actions">
          <button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Creating…' : 'Create job'}</button>
          <button type="button" className="cancel-btn" onClick={() => { setShowCreate(false); setName(''); setNote(''); setErr('') }}>Cancel</button>
        </div>
      </form>
    )}

    {jobs.length === 0 && !showCreate ? (
      <div className="empty-state saved-empty"><div className="empty-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /></svg></div><h2>No jobs yet</h2><p>Create a job to start grouping regs by project.</p></div>
    ) : (
      <div className="jobs-list">
        {jobs.map((job) => {
          const items = jobItems[job.id] || []
          const degraded = items.some((item) => {
            const entry = entryMap.get(item.entry_id)
            return entry && entry.status !== 'verified'
          })
          return <article key={job.id} className="job-row" onClick={() => onOpenJob(job)}>
            <div className="job-row-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /></svg></div>
            <div className="job-row-info">
              <h3>{job.name}</h3>
              {job.note && <p>{job.note}</p>}
              <div className="job-row-meta">
                <span>{items.length} {items.length === 1 ? 'reg' : 'regs'}</span>
                {degraded && <span className="job-degraded"><span className="status-dot" /> Has warnings</span>}
              </div>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="job-row-arrow"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
          </article>
        })}
      </div>
    )}
  </section>
}

export function JobDetailScreen({ job, items, allEntries, onBack, onRemoveReg, onOpenEntry, onRenameJob, onDeleteJob, readOnly = false }) {
  const [showEdit, setShowEdit] = useState(false)
  const [name, setName] = useState(job.name)
  const [note, setNote] = useState(job.note || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const entryMap = useMemo(() => new Map(allEntries.map((e) => [e.id, e])), [allEntries])
  const removedIds = (items || []).filter((item) => !entryMap.has(item.entry_id)).map((item) => item.entry_id)
  const liveItems = (items || []).filter((item) => entryMap.has(item.entry_id))

  async function handleRename(event) {
    event.preventDefault()
    setBusy(true); setErr('')
    try {
      await onRenameJob(job.id, name, note)
      setShowEdit(false)
    } catch (e) {
      setErr(e.message || 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setBusy(true); setErr('')
    try {
      await onDeleteJob(job.id)
      onBack()
    } catch (e) {
      setErr(e.message || 'Could not delete')
    } finally {
      setBusy(false)
    }
  }

  return <section className="screen job-detail-screen">
    <button className="back-btn" onClick={onBack}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg> Jobs</button>
    <div className="section-top">
      <div><div className="eyebrow">JOB</div><h1>{job.name}</h1>{job.note && <p className="job-note-display">{job.note}</p>}</div>
      {!readOnly && <button className="edit-job-btn" onClick={() => { setName(job.name); setNote(job.note || ''); setShowEdit(!showEdit) }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg></button>}
    </div>

    {showEdit && (
      <form className="job-create-card" onSubmit={handleRename}>
        {err && <div className="auth-error">{err}</div>}
        <label className="auth-field"><span>Job name</span><div className="auth-input-wrap"><input value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></div></label>
        <label className="auth-field"><span>Note</span><div className="auth-input-wrap"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" /></div></label>
        <div className="job-create-actions">
          <button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          <button type="button" className="cancel-btn" onClick={() => setShowEdit(false)}>Cancel</button>
        </div>
        {!confirmDelete ? (
          <button type="button" className="danger-btn" onClick={() => setConfirmDelete(true)}>Delete this job</button>
        ) : (
          <div className="confirm-delete">
            <p>Delete this job? The regs in it are not removed from other jobs or your saves.</p>
            <div className="confirm-actions">
              <button type="button" className="danger-btn" onClick={handleDelete} disabled={busy}>{busy ? 'Deleting…' : 'Yes, delete'}</button>
              <button type="button" className="cancel-btn" onClick={() => setConfirmDelete(false)}>Keep it</button>
            </div>
          </div>
        )}
      </form>
    )}

    <div className="results-meta"><strong>{liveItems.length} {liveItems.length === 1 ? 'reg' : 'regs'}</strong>{removedIds.length > 0 && <span>{removedIds.length} no longer in register</span>}</div>
    <div className="results-list">
      {liveItems.map((item) => {
        const entry = entryMap.get(item.entry_id)
        if (!entry) return null
        const trust = entry.status === 'verified'
          ? { kind: 'verified', message: entry.verified?.on ? `Verified on ${new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(entry.verified.on))}` : 'Verified' }
          : { kind: 'warning', message: entry.remedial_note || 'Source changed or not re-checked' }
        const meta = { technical: 'Technical', licensing: 'Licensing', documentation: 'Documentation', whs: 'WHS', product: 'Product' }[entry.ui?.obligation] || 'Other'
        return <article key={item.id || item.entry_id} className="reg-card" onClick={() => onOpenEntry(entry)}>
          <div className="card-top"><span className={`type-badge ${entry.ui?.obligation || ''}`}>{meta}</span>{!readOnly && <button className="save-button" onClick={(e) => { e.stopPropagation(); onRemoveReg(job.id, item.entry_id) }} aria-label="Remove from job"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg></button>}</div>
          <h2>{entry.ui?.title || entry.claim}</h2>
          <p className="card-value">{entry.value}</p>
          <div className="card-bottom"><span className={`status ${trust.kind}`}><span className="status-dot" />{trust.message}</span><span className="card-ref">{entry.ui?.ref}</span></div>
        </article>
      })}
      {liveItems.length === 0 && !showEdit && <div className="empty-state saved-empty"><h2>No regs in this job yet</h2><p>{readOnly ? 'This job has no current regulations.' : 'Open a regulation and use "Add to job" to put it here.'}</p></div>}
    </div>
    {removedIds.length > 0 && <div className="removed-saves"><h3>No longer in the register</h3>{removedIds.map((id) => <div key={id} className="removed-row"><span>{id}</span>{!readOnly && <button onClick={() => onRemoveReg(job.id, id)}>Remove</button>}</div>)}</div>}
  </section>
}

export function AddToJobModal({ entry, jobs, jobItems, onClose, onAdd, onCreateNew }) {
  const [showNew, setShowNew] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const isInJob = (jobId) => (jobItems[jobId] || []).some((item) => item.entry_id === entry.id)

  async function handleAdd(jobId) {
    setBusy(true)
    try {
      await onAdd(jobId, entry.id)
      onClose()
    } catch (e) {
      setErr(e.message || 'Could not add')
    } finally {
      setBusy(false)
    }
  }

  async function handleCreateNew(event) {
    event.preventDefault()
    setBusy(true); setErr('')
    try {
      const newJob = await onCreateNew(name)
      await onAdd(newJob.id, entry.id)
      onClose()
    } catch (e) {
      setErr(e.message || 'Could not create')
    } finally {
      setBusy(false)
    }
  }

  return <div className="modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="detail-modal add-to-job-modal" role="dialog" aria-modal="true">
      <div className="modal-handle" />
      <div className="modal-header">
        <span className="type-badge">Add to job</span>
        <button className="close-button" onClick={onClose} aria-label="Close"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
      </div>
      <h1 className="auth-title">Add to job</h1>
      <p className="auth-subtitle">{entry.ui?.title || entry.claim}</p>
      {err && <div className="auth-error">{err}</div>}
      {showNew ? (
        <form className="auth-form" onSubmit={handleCreateNew}>
          <label className="auth-field"><span>Job name</span><div className="auth-input-wrap"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bennett St reno" required autoFocus /></div></label>
          <div className="job-create-actions">
            <button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Creating…' : 'Create & add'}</button>
            <button type="button" className="cancel-btn" onClick={() => setShowNew(false)}>Back</button>
          </div>
        </form>
      ) : (
        <div className="add-to-job-list">
          {jobs.length > 0 && jobs.map((job) => (
            <button key={job.id} className={`add-to-job-row ${isInJob(job.id) ? 'already' : ''}`} onClick={() => !isInJob(job.id) && handleAdd(job.id)} disabled={isInJob(job.id) || busy}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /></svg>
              <span>{job.name}</span>
              {isInJob(job.id) && <small>Already in</small>}
            </button>
          ))}
          <button className="add-to-job-row new" onClick={() => setShowNew(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            <span>Create a new job</span>
          </button>
        </div>
      )}
    </section>
  </div>
}
