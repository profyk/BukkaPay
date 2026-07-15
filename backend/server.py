"""FastAPI entrypoint. Run with:

    uvicorn server:app --host 0.0.0.0 --port $PORT --workers $WEB_CONCURRENCY

Local dev:

    uvicorn server:app --reload
"""

from app.main import create_app

app = create_app()
