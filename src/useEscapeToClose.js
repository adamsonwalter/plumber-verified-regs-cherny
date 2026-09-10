import { useEffect } from 'react'

/**
 * Dismiss a modal on Escape.
 *
 * Every modal in this app is role="dialog" aria-modal="true", and the ARIA
 * dialog pattern says Escape dismisses. None of them listened for it, so the
 * reflex every user has did nothing. Backdrop click and the close button
 * already worked; this is the third way out.
 *
 * Lives in its own module rather than main.jsx because jobs.jsx needs it too,
 * and main.jsx already imports from jobs.jsx — importing back would make the
 * cycle real.
 */
export function useEscapeToClose(onClose) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
}
