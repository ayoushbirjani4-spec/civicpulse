from fastapi import APIRouter, UploadFile, File, Form, status, HTTPException, Query
from app.utils.image_processor import process_and_save_image
from app.database import get_db_connection

router = APIRouter(prefix="/reports", tags=["Reports"])

# --- HARDCODED CATEGORIES (Ya aap DB se bhi la sakte hain) ---
AVAILABLE_CATEGORIES = [
    "Pothole",
    "Broken Streetlight",
    "Garbage Dump",
    "Water Leakage",
    "Damaged Signage",
    "Other"
]

@router.get("/categories", status_code=status.HTTP_200_OK)
async def get_categories():
    """Blueprint Module 2: Get available hazard categories"""
    return {
        "status": "success",
        "categories": AVAILABLE_CATEGORIES
    }


# --- 1. POST ENDPOINT (Hazard Report Creation + Duplicate Check + Mock Flag) ---
@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_hazard_report(
    category: str = Form(...),
    description: str = Form(None),
    latitude: float = Form(...),
    longitude: float = Form(...),
    accuracy: float = Form(...),
    client_uuid: str = Form(...),
    is_mocked: bool = Form(False, description="True if location is mocked/fake"),
    photo: UploadFile = File(...)
):
    file_bytes = await photo.read()
    image_metadata = process_and_save_image(file_bytes, photo.filename)

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Duplicate Image Detection (SHA-256 Check)
                cur.execute(
                    """
                    SELECT r.id, r.category, r.created_at 
                    FROM report_images i
                    JOIN reports r ON i.report_id = r.id
                    WHERE i.sha256 = %s;
                    """,
                    (image_metadata["sha256"],)
                )
                existing_duplicate = cur.fetchone()

                if existing_duplicate:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail={
                            "error": "Duplicate report detected!",
                            "message": "This exact image has already been submitted.",
                            "existing_report_id": existing_duplicate[0],
                            "category": existing_duplicate[1],
                            "submitted_at": str(existing_duplicate[2])
                        }
                    )

                # Save into PostgreSQL / PostGIS Database with is_mocked flag
                cur.execute(
                    """
                    INSERT INTO reports (client_uuid, category, description, location, accuracy, is_mocked, created_at)
                    VALUES (%s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s, %s, NOW())
                    RETURNING id;
                    """,
                    (client_uuid, category, description, longitude, latitude, accuracy, is_mocked)
                )
                report_id = cur.fetchone()[0]

                cur.execute(
                    """
                    INSERT INTO report_images (report_id, image_id, file_path, url_path, sha256, phash, width, height, file_size)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s);
                    """,
                    (
                        report_id,
                        image_metadata["image_id"],
                        image_metadata["file_path"],
                        image_metadata["url_path"],
                        image_metadata["sha256"],
                        image_metadata["phash"],
                        image_metadata["width"],
                        image_metadata["height"],
                        image_metadata["file_size"]
                    )
                )
                conn.commit()
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database operation failed: {str(e)}"
        )

    return {
        "status": "success",
        "message": "Hazard report and image successfully saved to PostGIS database!",
        "client_uuid": client_uuid,
        "report_id": report_id,
        "is_mocked": is_mocked,
        "image": image_metadata,
        "location": {"latitude": latitude, "longitude": longitude, "accuracy": accuracy},
        "category": category,
        "description": description
    }


# --- 2. GET SPATIAL RADIUS QUERY ---
@router.get("/", status_code=status.HTTP_200_OK)
async def get_reports_within_radius(
    latitude: float = Query(..., description="Center point latitude"),
    longitude: float = Query(..., description="Center point longitude"),
    radius_km: float = Query(5.0, description="Search radius in kilometers")
):
    radius_meters = radius_km * 1000.0

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT r.id, r.client_uuid, r.category, r.description, r.accuracy, r.is_mocked, r.created_at,
                           ST_Y(r.location::geometry) as latitude,
                           ST_X(r.location::geometry) as longitude,
                           i.url_path, i.phash
                    FROM reports r
                    LEFT JOIN report_images i ON r.id = i.report_id
                    WHERE ST_DWithin(
                        r.location::geography,
                        ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography,
                        %s
                    );
                    """,
                    (longitude, latitude, radius_meters)
                )
                rows = cur.fetchall()

                reports = []
                for row in rows:
                    reports.append({
                        "id": row[0],
                        "client_uuid": row[1],
                        "category": row[2],
                        "description": row[3],
                        "accuracy": row[4],
                        "is_mocked": row[5],
                        "created_at": row[6],
                        "latitude": row[7],
                        "longitude": row[8],
                        "image_url": row[9],
                        "phash": row[10]
                    })

                return {
                    "status": "success",
                    "count": len(reports),
                    "search_params": {
                        "latitude": latitude,
                        "longitude": longitude,
                        "radius_km": radius_km
                    },
                    "reports": reports
                }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch spatial reports: {str(e)}"
        )


# --- 3. GET REPORTS BY CLIENT UUID (GET /reports/mine) ---
@router.get("/mine/{client_uuid}", status_code=status.HTTP_200_OK)
async def get_my_reports(client_uuid: str):
    """Blueprint Module 2: Fetch reports submitted by a specific mobile client"""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT r.id, r.category, r.description, r.accuracy, r.is_mocked, r.created_at,
                           ST_Y(r.location::geometry) as latitude,
                           ST_X(r.location::geometry) as longitude,
                           i.url_path
                    FROM reports r
                    LEFT JOIN report_images i ON r.id = i.report_id
                    WHERE r.client_uuid = %s;
                    """,
                    (client_uuid,)
                )
                rows = cur.fetchall()
                reports = [{
                    "id": row[0], "category": row[1], "description": row[2],
                    "accuracy": row[3], "is_mocked": row[4], "created_at": row[5],
                    "latitude": row[6], "longitude": row[7], "image_url": row[8]
                } for row in rows]

                return {"status": "success", "client_uuid": client_uuid, "count": len(reports), "reports": reports}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- 4. GET SINGLE REPORT BY ID (GET /reports/{id}) ---
@router.get("/{report_id}", status_code=status.HTTP_200_OK)
async def get_report_by_id(report_id: int):
    """Blueprint Module 2: Fetch single report detailed view"""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT r.id, r.client_uuid, r.category, r.description, r.accuracy, r.is_mocked, r.created_at,
                           ST_Y(r.location::geometry) as latitude,
                           ST_X(r.location::geometry) as longitude,
                           i.url_path, i.sha256, i.phash
                    FROM reports r
                    LEFT JOIN report_images i ON r.id = i.report_id
                    WHERE r.id = %s;
                    """,
                    (report_id,)
                )
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Report not found")

                return {
                    "status": "success",
                    "report": {
                        "id": row[0], "client_uuid": row[1], "category": row[2],
                        "description": row[3], "accuracy": row[4], "is_mocked": row[5],
                        "created_at": row[6], "latitude": row[7], "longitude": row[8],
                        "image_url": row[9], "sha256": row[10], "phash": row[11]
                    }
                }
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))