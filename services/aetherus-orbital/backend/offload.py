"""Keep the CPU-bound screening cascade off the API event loop.

Screening is minutes-to-hours of NumPy and SGP4 with no I/O anywhere in it, so
a coroutine that calls it directly never yields: the event loop cannot service
another request until the whole cascade returns. That made the 202 from
``POST /v1/conjunctions/screen-runs`` only half true - the job handle came back
at once, the work did not run in the background. Measured 2026-09-03 against a
400-object run, ``GET /health`` went from a 6.8 ms baseline to 0.13-9.17 s.

Handing the synchronous section to a worker thread restores the loop. The
science is untouched: the same functions run in the same order, so
``coarse_screen``'s chunk ordering - which is load-bearing for every downstream
hash - is exactly the ordering the sequential path produced.

One worker by default, so screening runs queue instead of overlapping. A full
catalogue run holds ~9 GB (96 M shell survivors plus the propagated grid) and
saturates the cores through ``coarse_screen``'s own level-one pool, so a second
concurrent run costs memory and cache without finishing anything sooner.
``screening_max_concurrent_runs`` raises the bound where the headroom is real;
it governs how many *runs* compute at once, distinct from
``AETHERUS_SCREENING_WORKERS``, which parallelises level-one inside one run.
"""

import asyncio
import functools
import threading
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from typing import ParamSpec, TypeVar

from backend.config import settings

_Params = ParamSpec("_Params")
_Result = TypeVar("_Result")

_executor: ThreadPoolExecutor | None = None
_executor_lock = threading.Lock()


def screening_executor() -> ThreadPoolExecutor:
    """The pool that owns every screening run; built on first use."""
    global _executor
    if _executor is None:
        with _executor_lock:
            if _executor is None:
                _executor = ThreadPoolExecutor(
                    max_workers=max(1, settings.screening_max_concurrent_runs),
                    thread_name_prefix="screening",
                )
    return _executor


async def run_screening_off_loop(
    func: Callable[_Params, _Result],
    *args: _Params.args,
    **kwargs: _Params.kwargs,
) -> _Result:
    """Await ``func(*args, **kwargs)`` on a screening worker, not on the loop.

    Whatever the call raises is re-raised here unchanged, so a caller's existing
    ``except PropagationError`` / ``except ValueError`` handling keeps working.
    """
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        screening_executor(), functools.partial(func, *args, **kwargs)
    )


def shutdown_screening_executor(wait: bool = False) -> None:
    """Drop the pool, cancelling queued runs.

    A run already inside a worker cannot be interrupted - a thread running SGP4
    has no cancellation point - so the interpreter still joins it at exit. That
    is not new: before this module existed the same computation blocked the
    loop, and shutdown waited on it just the same.
    """
    global _executor
    with _executor_lock:
        executor, _executor = _executor, None
    if executor is not None:
        executor.shutdown(wait=wait, cancel_futures=True)
