"""GLM-Image API client for prototype wireframe generation."""

import httpx

from app.config import settings


async def generate_image(prompt: str, size: str = "1024x768") -> str | None:
    """Generate an image using GLM-Image API and return the image URL."""
    if not settings.GLM_IMAGE_API_KEY:
        return None

    headers = {
        "Authorization": f"Bearer {settings.GLM_IMAGE_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.GLM_IMAGE_MODEL,
        "prompt": prompt,
        "size": size,
    }

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                settings.GLM_IMAGE_BASE_URL,
                json=payload,
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json()
            if "data" in data and len(data["data"]) > 0:
                return data["data"][0].get("url")
    except Exception:
        return None
    return None
