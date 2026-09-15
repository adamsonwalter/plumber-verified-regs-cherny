import { createPortal } from 'react-dom'

const dateFmt = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
const stampFmt = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' })

function statusOf(entry) {
  if (entry.status === 'verified') return { label: 'Verified', checked: entry.verified?.on ? dateFmt.format(new Date(entry.verified.on)) : 'Date not recorded' }
  if (entry.status === 'unverified') return { label: 'Source changed', checked: 'Not confirmed as current' }
  return { label: 'Not re-checked', checked: 'Not confirmed as current' }
}

/**
 * The printable record for one job: each reg as it stood against its
 * government source, with the date it was last checked.
 *
 * Rendered into <body> and shown only when printing, so "Download job record"
 * is just window.print(). That gives Save as PDF on desktop and, on iPhone,
 * the share sheet's print preview, without a PDF library or a server, and it
 * works from a Home Screen install where opening a new window would drop the
 * user into Safari.
 *
 * It records the register as it stands when printed, not when each reg was
 * added to the job. The header says so; storing per-job snapshots is a later
 * change.
 */
export function JobRecord({ job, entries, register }) {
  const lastRun = register?.last_run?.on ? dateFmt.format(new Date(register.last_run.on)) : 'unknown'
  return createPortal(
    <article className="job-record" aria-hidden="true">
      <header>
        <p className="jr-kicker">Job record · VIC PlumberRegs</p>
        <h1>{job.name}</h1>
        {job.note && <p className="jr-note">{job.note}</p>}
        <p className="jr-meta">Printed {stampFmt.format(new Date())}. Register version {register?.register_version || 'unknown'}, last checked against government sources on {lastRun}. Each reg below shows its own status and check date as at printing.</p>
      </header>
      {entries.length === 0 && <p>No regs in this job.</p>}
      {entries.map((entry) => {
        const st = statusOf(entry)
        const source = entry.human_url || entry.source_url
        return <section key={entry.id} className="jr-entry">
          <h2>{entry.ui?.title || entry.claim}</h2>
          <table>
            <tbody>
              <tr><th>Value</th><td>{entry.value}</td></tr>
              <tr><th>Where</th><td>{[entry.ui?.ref, entry.ui?.doc].filter(Boolean).join(' · ')}</td></tr>
              <tr><th>Status</th><td>{st.label}</td></tr>
              <tr><th>Checked</th><td>{st.checked}</td></tr>
              {entry.status === 'verified' && entry.verified?.quote && <tr><th>Source says</th><td>“{entry.verified.quote}”</td></tr>}
              {entry.status !== 'verified' && entry.remedial_note && <tr><th>Note</th><td>{entry.remedial_note}</td></tr>}
              {source && <tr><th>Source</th><td className="jr-url">{source}</td></tr>}
            </tbody>
          </table>
        </section>
      })}
      <footer>The government source is the authority, not this record. A reg marked other than Verified was not confirmed as current when printed; check its source before relying on it.</footer>
    </article>,
    document.body,
  )
}
