from fastapi import Depends, FastAPI
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.auth import router as auth_router
from app.database import test_connection
from app.deps import get_current_user, require_admin
from app.limiter import limiter
from app.models import User

app = FastAPI(title="CivicPulse API")

app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.include_router(auth_router)


@app.get("/")
def home():
    return {"message": "CivicPulse API is running!"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/db-test")
def db_test():
    try:
        version = test_connection()
        return {"database": "connected", "version": version}
    except Exception as error:
        return {"database": "failed", "error": str(error)}


@app.get("/me")
def me(user: User = Depends(get_current_user)):
    return {"email": user.email, "role": user.role}


@app.get("/admin/ping")
def admin_ping(user: User = Depends(require_admin)):
    return {"ok": True}
