import io
import os
import uuid
import hashlib
from PIL import Image, ImageOps
import imagehash
from fastapi import HTTPException, status

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB Limit
UPLOAD_DIR = "media"

os.makedirs(UPLOAD_DIR, exist_ok=True)

def process_and_save_image(file_bytes: bytes, original_filename: str) -> dict:
    # 1. File Size Validation (Max 5MB)
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size 5MB se zyada nahi honi chahiye."
        )

    # 2. SHA-256 Hash computation for exact duplicate detection
    sha256_hash = hashlib.sha256(file_bytes).hexdigest()

    try:
        # 3. Open image with Pillow
        image = Image.open(io.BytesIO(file_bytes))
        
        # Format validation
        if image.format not in ["JPEG", "PNG", "WEBP"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Sirf JPEG, PNG ya WEBP images allowed hain."
            )

        # 4. EXIF Stripping & Auto-Orientation
        image = ImageOps.exif_transpose(image)

        if image.mode in ("RGBA", "P"):
            image = image.convert("RGB")

        # 5. Resize to at most 1600px on the long side (Blueprint Requirement)
        max_dimension = 1600
        if image.width > max_dimension or image.height > max_dimension:
            image.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)

        # 6. Compute Perceptual Hash (phash) for similar image detection
        phash_value = str(imagehash.phash(image))

        # 7. Generate Server-Side Random UUID Filename
        file_id = str(uuid.uuid4())
        filename = f"{file_id}.jpg"
        file_path = os.path.join(UPLOAD_DIR, filename)

        # 8. Save re-encoded JPEG without metadata
        image.save(file_path, "JPEG", quality=85, optimize=True)

        return {
            "image_id": file_id,
            "file_path": file_path,
            "url_path": f"/media/{filename}",
            "sha256": sha256_hash,
            "phash": phash_value,
            "width": image.width,
            "height": image.height,
            "file_size": os.path.getsize(file_path)
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid image file: {str(e)}"
        )