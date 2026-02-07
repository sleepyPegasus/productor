"""Image generation client via OpenRouter (OpenAI-compatible images API)."""

import httpx

from app.config import settings


async def generate_image(prompt: str, model: str = None, size: str = "1024x1024") -> str | None:
    """Generate an image via OpenRouter and return the image URL."""
    if not settings.OPENROUTER_API_KEY:
        return None

    image_model = model or settings.DEFAULT_IMAGE_MODEL
    url = f"{settings.OPENROUTER_BASE_URL.rstrip('/')}/images/generations"

    headers = {
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": image_model,
        "prompt": prompt,
        "size": size,
        "n": 1,
    }

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            if "data" in data and len(data["data"]) > 0:
                return data["data"][0].get("url")
    except Exception:
        return None
    return None
