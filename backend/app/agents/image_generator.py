"""Image generation client via OpenRouter (chat completions with modalities)."""

import logging
import re

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


def _extract_image_url(data: dict) -> str | None:
    """Extract image URL from OpenRouter chat completions response.

    OpenRouter returns generated images as base64-encoded data URLs
    in the assistant message content (multimodal parts array).
    """
    choices = data.get("choices", [])
    if not choices:
        logger.warning("Image response has no choices")
        return None

    content = choices[0].get("message", {}).get("content")
    if not content:
        logger.warning("Image response has no content")
        return None

    # Content can be a list of parts (multimodal) or a string
    if isinstance(content, list):
        for part in content:
            if not isinstance(part, dict):
                continue
            # OpenRouter returns image parts with type "image_url"
            if part.get("type") == "image_url":
                url = part.get("image_url", {}).get("url", "")
                if url:
                    return url
        logger.warning("No image found in multimodal content parts: %s",
                       [p.get("type") for p in content if isinstance(p, dict)])
    elif isinstance(content, str):
        # Some models may return the data URL inline in text
        match = re.search(r'data:image/[^;]+;base64,[A-Za-z0-9+/=]+', content)
        if match:
            return match.group(0)
        logger.warning("No image data URL found in string content")

    return None


async def generate_image(prompt: str, model: str = None, size: str = "1024x1024") -> str | None:
    """Generate an image via OpenRouter and return the image data URL.

    Uses the /chat/completions endpoint with modalities parameter,
    which is OpenRouter's unified approach for image generation.
    """
    if not settings.OPENROUTER_API_KEY:
        logger.warning("OPENROUTER_API_KEY is not configured, cannot generate image")
        return None

    image_model = model or settings.DEFAULT_IMAGE_MODEL
    url = f"{settings.OPENROUTER_BASE_URL.rstrip('/')}/chat/completions"

    headers = {
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": image_model,
        "messages": [
            {"role": "user", "content": prompt},
        ],
        "modalities": ["image", "text"],
    }

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            image_url = _extract_image_url(data)
            if not image_url:
                logger.warning("Image generation returned no image (model=%s): keys=%s",
                               image_model, list(data.keys()))
            return image_url
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
