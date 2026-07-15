"""ARQ background-worker entrypoint. Run with:

    arq worker.WorkerSettings
"""

from app.workers.settings import WorkerSettings

__all__ = ["WorkerSettings"]
