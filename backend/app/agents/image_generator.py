"""Image generation client via OpenRouter (OpenAI-compatible images API)."""

import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


async def generate_image(prompt: str, model: str = None, size: str = "1024x1024") -> str | None:
    """Generate an image via OpenRouter and return the image URL."""
    if not settings.OPENROUTER_API_KEY:
        logger.warning("OPENROUTER_API_KEY is not configured, cannot generate image")
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
                item = data["data"][0]
                # Prefer URL, fall back to base64-encoded data
                if item.get("url"):
                    return item["url"]
                if item.get("b64_json"):
                    return f"data:image/png;base64,{item['b64_json']}"
                logger.warning("Image response has no 'url' or 'b64_json': %s", list(item.keys()))
            else:
                logger.warning("Image response missing 'data' array: %s", list(data.keys()))
    except httpx.HTTPStatusError as e:
        logger.error(
            "Image generation HTTP error (model=%s): %s - %s",
            image_model, e.response.status_code, e.response.text[:500],
        )
    except httpx.TimeoutException:
        logger.error("Image generation timed out (model=%s)", image_model)
    except Exception as e:
        logger.error("Image generation failed (model=%s): %s", image_model, e)
    return None
