#!/usr/bin/env python3
"""
Netlify SCHEDULED BACKGROUND function — weekly agentic re-verification.

Capability (b): the platform's OWN scheduler re-opens every source URL,
extracts the current text, and reasons about whether each recorded claim still
matches, then updates register.json — refreshing the verified block, or
flipping the entry to unverified (with changed_from/changed_to) or
unreachable (with remedial_note + last_successful_check).

Declared in netlify.toml:
    [functions."verify_register_scheduled"]
    schedule = "0 7 * * 1"        # weekly, Monday 07:00 UTC (platform cron)

This is a BACKGROUND function (filename ends in `_scheduled` and it is wired
as background-capable) so it is not bound by the 30 s scheduled-function
limit — re-verifying ~30 sources behind Cloudflare needs minutes.

It is IDEMPOTENT and keyed on the Netlify invocation id in
`context.aws_request_id` / the event — it never trusts a request body. It
reads register.json fresh each run.

Publishing model (matches the project's git-committed-JSON convention):
  - The function writes the proposed updated register to a versioned file
    alongside register.json (register.proposed.<runid>.json) and a run log.
  - If GIT_PUBLISH_TOKEN + GIT_REPO are configured, it commits the update back
    so Netlify auto-redeploys via the normal git pipeline.
  - The publish gate (scripts/verify_register.py --live) still governs what
    ships: a register with any unconfirmed verified entry is blocked.

Reasoning is delegated to scripts/verify_register.py's fetch+strip logic so
the gate and the agent agree on what "verified" means.
"""
import json
import os
import sys
import traceback
from datetime import datetime, timezone

# Make the scripts/ module importable inside the function runtime.
_HERE = os.path.dirname(os.path.abspath(__file__))
_SCRIPTS = os.path.normpath(os.path.join(_HERE, "..", "scripts"))
if _SCRIPTS not in sys.path:
    sys.path.insert(0, _SCRIPTS)

# Import the shared fetch/reason primitives. These are the SAME code paths the
# publish gate uses, so "verified" means the same thing in both places.
try:
    import verify_register as vr
    import fsutil
except Exception as imp_err:  # pragma: no cover - import guard
    vr = None
    fsutil = None
    _IMPORT_ERROR = imp_err
else:
    _IMPORT_ERROR = None


def _now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _today():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _load_register():
    """Find register.json. Prefer the deployed repo copy."""
    candidates = [
        os.path.join(os.getcwd(), "register.json"),
        os.path.join(_HERE, "..", "register.json"),
        os.path.join(_HERE, "..", "public", "register.json"),
    ]
    for p in candidates:
        p = os.path.abspath(p)
        if os.path.exists(p):
            with open(p) as f:
                return json.load(f), p
    return None, None


def _extract_snippet(text, needle, span=180):
    if not text:
        return ""
    if not needle:
        return text[:span]
    idx = text.lower().find(needle.lower())
    if idx < 0:
        return text[:span]
    start = max(0, idx - 80)
    return text[start: idx + len(needle) + 120].strip()


def reverify_all(run_id):
    """Re-open every source, reason, return (updated_register, results)."""
    if _IMPORT_ERROR is not None:
        raise RuntimeError(f"could not import verify_register: {_IMPORT_ERROR}")
    reg, reg_path = _load_register()
    if not reg:
        raise RuntimeError("register.json not found")

    entries = reg.get("entries", [])
    results = []
    # Share a requests.Session per host so Cloudflare clearance cookies persist
    # across entries on the same host (matches verify_register.run_live_checks).
    sessions = {}

    def _session_for(host):
        if host not in sessions:
            import requests as _r
            sessions[host] = _r.Session()
        return sessions[host]

    for e in entries:
        url = e["source_url"]
        needle = e.get("key_substring", "")
        # Domain gate first — never fetch a non-official host.
        host = ""
        try:
            from urllib.parse import urlparse
            host = urlparse(url).hostname or ""
        except Exception:
            pass
        if not vr.is_official(host):
            e["status"] = "unreachable"
            e["last_status"] = f"non-official domain: {host}"
            e["remedial_note"] = (
                f"Source host {host} is not on the official allow-list "
                f"(gov.au / abcb.gov.au). Replace with an authoritative source."
            )
            results.append({"id": e["id"], "verdict": "rejected_nonofficial", "host": host})
            continue

        kind, status, text, final_url = vr.fetch_ex(url, session=_session_for(host))
        # Enforce every substring the claim depends on, not just the primary
        # key — otherwise the agent would keep re-verifying an entry the publish
        # gate would block (see also_requires in verify_register.run_live_checks).
        extras = e.get("also_requires") or []
        _low = (text or "").lower()
        missing = [n for n in ([needle] + list(extras)) if n.lower() not in _low]
        present = bool(text) and not missing
        # A source can 301 to a new home and still verify, because the fetch
        # follows the hop. Left undetected the register silently depends on a
        # redirect the publisher may one day drop, so record the move.
        moved_to = final_url if (kind == "ok" and not vr.same_url(final_url, url)) else None

        if kind == "ok" and present:
            # CONFIRMED — refresh the verified block.
            prev = dict(e.get("verified", {}))
            e["status"] = "verified"
            e["verified"] = {
                "against": url,
                "on": _today(),
                "by_agent": run_id,
                "quote": _extract_snippet(text, needle, 180) or prev.get("quote", ""),
            }
            for k in ("changed_from", "changed_to", "last_status",
                      "last_successful_check", "remedial_note", "http_error"):
                e.pop(k, None)
            if moved_to:
                e["source_moved_to"] = moved_to
                e["next_edit"] = f"Update source_url to {moved_to}"
            else:
                e.pop("source_moved_to", None)
                e.pop("next_edit", None)
            results.append({"id": e["id"], "verdict": "verified", "status": status,
                            "moved_to": moved_to})

        elif kind == "ok" and not present:
            # Source reachable, but the recorded value no longer matches — FLIP.
            prior_value = e.get("value")
            prev = e.get("verified", {})
            e["status"] = "unverified"
            e["changed_from"] = prior_value
            e["verified"] = {
                "against": url,
                "on": _today(),
                "by_agent": run_id,
                "quote": _extract_snippet(text, "", 220) or prev.get("quote", ""),
            }
            e["remedial_note"] = (
                f"Live page returned 2xx but "
                + ", ".join(repr(m) for m in missing)
                + " was not found in the current text. Open the source, "
                f"confirm the new value, and update register.json. Then re-run "
                f"scripts/verify_register.py --live to clear the gate."
            )
            e["changed_to"] = (
                "(missing on current page: " + ", ".join(missing) + ")"
            )
            results.append({"id": e["id"], "verdict": "unverified", "status": status})

        else:
            # UNREACHABLE — non-2xx, Cloudflare challenge, or network error.
            if e.get("status") == "verified":
                e["last_successful_check"] = e.get("verified", {}).get("on") or \
                    reg.get("generated_on", "unknown")
            e["status"] = "unreachable"
            e["last_status"] = str(status)
            e["http_error"] = f"{kind} {status}".strip()
            e["remedial_note"] = (
                f"Source could not be opened by the scheduled agent ({kind}). "
                f"If this is a transient Cloudflare challenge or network error "
                f"it usually clears on the next run, restoring verified status. "
                f"If it persists, try an alternate authoritative URL (e.g. the "
                f"matching legislation.vic.gov.au instrument page) or escalate "
                f"to manual lookup against the printed statutory instrument."
            )
            results.append({"id": e["id"], "verdict": "unreachable", "kind": kind})

    reg["last_agent_run"] = _today()
    reg["last_run_id"] = run_id
    reg["register_version"] = f"{_today()}-agent"
    # Register-level summary of the most recent pass, so a reader (or the app)
    # can state when the register was last checked and how it came out without
    # walking all 59 entries.
    reg["last_run"] = {
        "run_id": run_id,
        "on": _today(),
        "by_agent": run_id,
        "counts": _tally(entries),
        "moved": [r["id"] for r in results if r.get("moved_to")],
        "note": ("Currency of the published text on official pages this run. "
                 "Not a compliance determination."),
    }
    return reg, reg_path, results


def _tally(entries):
    out = {"verified": 0, "unverified": 0, "unreachable": 0}
    for e in entries:
        out[e.get("status", "unverified")] = out.get(e.get("status", "unverified"), 0) + 1
    return out


def handler(event, context):
    """Netlify Python function entrypoint.

    For scheduled invocations `event` carries no HTTP data — the trigger is the
    platform timer. We identify this run via context.aws_request_id (never the
    request body), read register.json fresh, and re-verify.
    """
    run_id = "agent-" + _today() + "-" + (
        getattr(context, "aws_request_id", None)
        or os.environ.get("AWS_LAMBDA_LOG_STREAM_NAME", "")
        or os.environ.get("DEPLOY_ID", "")
        or "manual"
    )[-12:].replace("/", "")

    try:
        reg, reg_path, results = reverify_all(run_id)
    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({
                "ok": False, "run_id": run_id, "error": str(e),
                "trace": traceback.format_exc()[-1200:],
            }),
        }

    summary = _tally(reg["entries"])

    # Write the proposed update as a versioned sidecar — NEVER mutate the
    # canonical register mid-run. A git token (if configured) commits it.
    # Written atomically (temp + os.replace) so a crash or concurrent reader
    # never sees a half-written file.
    written = []
    if reg_path:
        sidecar = reg_path.replace(".json", f".proposed.{run_id}.json")
        try:
            fsutil.atomic_write_json(sidecar, reg)
            written.append(sidecar)
        except Exception as werr:
            written.append(f"write-error: {werr}")

    # Optional git publish (only if a token + repo are configured).
    #
    # The publish step is a read-modify-write of the canonical register, so two
    # overlapping invocations (Netlify retry / manual trigger during cron) could
    # race. We serialise them with an advisory file lock around the whole
    # publish, and the git commit itself retries on a 409 sha-conflict. If the
    # lock can't be acquired within the timeout, another run is mid-publish —
    # we skip gracefully rather than collide.
    publish_msg = "git publish not configured (set GIT_PUBLISH_TOKEN + GIT_REPO to enable)"
    token = os.environ.get("GIT_PUBLISH_TOKEN")
    repo = os.environ.get("GIT_REPO")
    if token and repo and reg_path:
        try:
            with fsutil.file_lock(reg_path, timeout=60):
                publish_msg = _git_publish(reg_path, reg, token, repo, run_id)
        except fsutil.LockTimeout as lt:
            # Transient collision: another invocation is publishing. Log and
            # skip — the sidecar above still records this run's verdict.
            publish_msg = f"skipped (lock busy): {lt}"
        except Exception as perr:
            publish_msg = f"git publish failed: {perr}"

    body = {
        "ok": True,
        "run_id": run_id,
        "started_with_invocation": getattr(context, "aws_request_id", "n/a"),
        "summary": summary,
        "written": written,
        "publish": publish_msg,
        "entries": results,
        "finished_at": _now_iso(),
    }
    return {"statusCode": 200, "body": json.dumps(body, indent=2)}


def _git_publish(reg_path, reg, token, repo, run_id, *, conflict_retries=3):
    """Commit the updated register back to the repo so Netlify redeploys.

    Uses the GitHub REST API contents endpoint (no git CLI needed). Only runs
    when GIT_PUBLISH_TOKEN + GIT_REPO are present in the function env.

    Handles the transient-collision case gracefully: the Contents API is
    optimistic — we fetch the file's current ``sha``, then PUT with it. If
    another commit landed in between, GitHub returns **409 Conflict** ("The
    sha ... does not match"). Rather than failing the run, we re-fetch the
    fresh ``sha`` and retry, up to ``conflict_retries`` times with backoff.
    A persistent conflict (genuine concurrent publisher) raises so the caller
    can report it clearly.
    """
    import base64
    import contextlib
    import time
    import urllib.error
    import urllib.request
    branch = os.environ.get("GIT_BRANCH", "main")
    path_in_repo = os.environ.get("REGISTER_PATH_IN_REPO", "register.json")
    api = f"https://api.github.com/repos/{repo}/contents/{path_in_repo}"
    content = base64.b64encode(json.dumps(reg, indent=2, ensure_ascii=False).encode()).decode()

    def _fetch_sha():
        req = urllib.request.Request(api, headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
        })
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.load(r).get("sha")

    last_err = None
    for attempt in range(conflict_retries):
        sha = _fetch_sha()
        payload = json.dumps({
            "message": f"chore(register): scheduled re-verification {run_id}",
            "content": content,
            "sha": sha,
            "branch": branch,
        }).encode()
        req2 = urllib.request.Request(api, data=payload, method="PUT", headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
        })
        try:
            with urllib.request.urlopen(req2, timeout=20) as r:
                resp = json.load(r)
            return f"committed {path_in_repo}@{resp.get('commit', {}).get('sha', '?')[:10]} on {branch}"
        except urllib.error.HTTPError as he:
            last_err = he
            # 409 = sha stale (a concurrent commit); 404 = path moved/removed.
            # Both are recoverable by re-fetching state and retrying.
            if he.code in (409, 404) and attempt < conflict_retries - 1:
                time.sleep(1.0 * (attempt + 1))  # linear backoff: 1s, 2s
                continue
            # Non-recoverable, or retries exhausted — surface a clear message.
            body = ""
            with contextlib.suppress(Exception):
                body = he.read().decode()[:300]
            raise RuntimeError(f"git publish HTTP {he.code} after {attempt + 1} attempt(s): {body}")
    # Should be unreachable, but be explicit.
    raise RuntimeError(f"git publish exhausted retries: {last_err}")


# Allow `python functions/verify_register_scheduled.py` for local testing.
if __name__ == "__main__":
    class _Ctx:
        aws_request_id = "local-" + str(int(datetime.now().timestamp()))
    evt = {}
    if len(sys.argv) > 1 and sys.argv[1] == "--json":
        print(handler(evt, _Ctx())["body"])
    else:
        out = handler(evt, _Ctx())
        print(out["body"])
