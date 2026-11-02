from fastapi import APIRouter, Depends

from app.deps import require_admin

# Every route on this router is admin-only. M5, M8, M9 and M11 add their routes here.
router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


@router.get("/ping")
def ping():
    return {"status": "ok"}
