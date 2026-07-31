"""Filesystem helpers for crash-safe writes and serialised read-modify-write.

Two concerns this module addresses:

1. **Atomic writes.** A naive ``open(path, "w")`` truncates the file *then*
   writes; if the process is killed, the host redeploys, or a reader opens the
   file mid-write, the reader sees a partial/truncated JSON. ``atomic_write_json``
   writes to a same-directory temp file, ``fsync``s, then ``os.replace``s it
   into place. ``os.replace`` is atomic on POSIX and Windows, so a reader ever
   sees either the whole old file or the whole new file — never a half-written
   one. The temp lives in the SAME directory as the target so the rename stays
   on one filesystem (avoids cross-device EXDEV).

2. **Transient lock collisions.** The scheduled agent does a read-modify-write
   of ``register.json``. Two overlapping invocations (Netlify retries on
   timeout, or a manual trigger during a cron run) would otherwise race:
   last-write-wins clobbers the other run's verdicts. ``file_lock`` is an
   advisory exclusive lock (``fcntl.flock`` on POSIX) with jittered backoff, so
   the second run waits for the first instead of colliding. It is deliberately
   host-local — each Netlify function instance is the only writer on its own
   filesystem; the cross-instance git race is handled separately by the 409
   retry in ``verify_register_scheduled._git_publish``.

No third-party dependencies; ``fcntl`` is stdlib on Linux/macOS (which covers
Netlify's runtime and local dev). A ``msvcrt`` fallback is included for
Windows local dev, though the production runtime is POSIX.
"""

from __future__ import annotations

import contextlib
import json
import os
import tempfile
import time
from typing import IO, Iterator

try:
    import fcntl as _fcntl  # POSIX
    _HAVE_FCNTL = True
except ImportError:  # pragma: no cover - Windows local dev only
    _HAVE_FCNTL = False

try:
    import msvcrt as _msvcrt  # Windows
    _HAVE_MSVCRT = True
except ImportError:
    _HAVE_MSVCRT = False


class LockTimeout(TimeoutError):
    """Raised when an advisory file lock can't be acquired within the timeout.

    The caller decides whether this is fatal. For the scheduled agent it is
    logged and the run is skipped (another invocation is already mid-publish);
    it is NOT a corrupting failure.
    """


def atomic_write_json(path: str, obj, *, indent: int = 2, ensure_ascii: bool = False) -> None:
    """Atomically write ``obj`` as JSON to ``path``.

    Writes to ``{path}.tmp.{pid}.{rand}`` in the same directory, flushes+fsyncs,
    then ``os.replace``s into place. A crash at any point leaves the previous
    file intact (or no file, on the very first write) — never a partial one.
    """
    directory = os.path.dirname(os.path.abspath(path)) or "."
    os.makedirs(directory, exist_ok=True)
    # NamedTemporaryFile in the SAME dir so the final rename is intra-filesystem.
    fd, tmp = tempfile.mkstemp(
        prefix=f".{os.path.basename(path)}.", suffix=".tmp", dir=directory
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(obj, f, indent=indent, ensure_ascii=ensure_ascii)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    except BaseException:
        # On any failure (including crash/KeyboardInterrupt) remove the temp
        # so we never leave stale .tmp litter; the original file is untouched.
        with contextlib.suppress(FileNotFoundError):
            os.remove(tmp)
        raise


def _lock_path(target: str) -> str:
    return target + ".lock"


def _acquire(handle: IO) -> None:
    if _HAVE_FCNTL:
        _fcntl.flock(handle.fileno(), _fcntl.LOCK_EX)
    elif _HAVE_MSVCRT:  # pragma: no cover - Windows
        _msvcrt.locking(handle.fileno(), _msvcrt.LK_LOCK, 1)
    # else: no native advisory lock available; locking is a no-op (single-writer
    # environments still get atomic-write safety, just not mutual exclusion).


def _try_acquire(handle: IO) -> bool:
    """Non-blocking acquire. Returns True on success, False if contended."""
    if _HAVE_FCNTL:
        try:
            _fcntl.flock(handle.fileno(), _fcntl.LOCK_EX | _fcntl.LOCK_NB)
            return True
        except (BlockingIOError, OSError):
            return False
    elif _HAVE_MSVCRT:  # pragma: no cover - Windows
        try:
            _msvcrt.locking(handle.fileno(), _msvcrt.LK_NBLCK, 1)
            return True
        except OSError:
            return False
    return True  # no native lock -> optimistically "acquired"


@contextlib.contextmanager
def file_lock(target: str, *, timeout: float = 30.0, poll: float = 0.2) -> Iterator[None]:
    """Advisory exclusive lock on ``target`` (via a sibling ``target.lock`` file).

    Acquires the lock with jittered backoff. If it can't acquire within
    ``timeout`` seconds, raises ``LockTimeout`` rather than blocking forever or
    colliding. The lock is released on exit (and automatically when the process
    exits, since flock locks are tied to the open file description).

    Use this to serialise the read-modify-write of the canonical register so
    two overlapping agent runs don't clobber each other.
    """
    lockfile = _lock_path(target)
    directory = os.path.dirname(os.path.abspath(lockfile)) or "."
    os.makedirs(directory, exist_ok=True)
    # "a+" so we don't truncate an existing lockfile (and create if absent).
    handle = open(lockfile, "a+")
    deadline = time.monotonic() + timeout
    acquired = False
    attempt = 0
    try:
        while True:
            if _try_acquire(handle):
                acquired = True
                break
            if time.monotonic() >= deadline:
                raise LockTimeout(
                    f"could not acquire lock on {target} within {timeout}s "
                    f"(another re-verification run is likely mid-publish)"
                )
            # Jittered backoff: poll + up to 50% jitter, capped, growing slowly.
            time.sleep(min(poll * (1 + 0.5 * (attempt % 5)), 2.0))
            attempt += 1
        yield
    finally:
        if acquired and _HAVE_FCNTL:
            with contextlib.suppress(OSError):
                _fcntl.flock(handle.fileno(), _fcntl.LOCK_UN)
        elif acquired and _HAVE_MSVCRT:  # pragma: no cover - Windows
            with contextlib.suppress(OSError):
                _msvcrt.locking(handle.fileno(), _msvcrt.LK_UNLCK, 1)
        handle.close()
