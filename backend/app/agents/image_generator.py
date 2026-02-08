"""Image generation client via OpenRouter (chat completions with modalities)."""

import logging
import re

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


def _extract_image_url(data: dict) -> str | None:
    """Extract image URL from OpenRouter chat completions response.

    OpenRouter may return generated images in two locations:
    1. ``message.content`` – multimodal parts array or inline base64 string.
    2. ``message.images`` – dedicated images array used by some providers
       (e.g. Gemini models).
    """
    choices = data.get("choices", [])
    if not choices:
        logger.warning("Image response has no choices")
        return None

    message = choices[0].get("message", {})

    # --- 1. Check dedicated ``images`` field (Gemini / newer providers) ---
    images = message.get("images")
    if images and isinstance(images, list):
        for img in images:
            if not isinstance(img, dict):
                continue
            if img.get("type") == "image_url":
                url = img.get("image_url", {}).get("url", "")
                if url:
                    return url
            # Also handle flat structure: {"url": "data:..."}
            flat_url = img.get("url", "")
            if flat_url:
                return flat_url

    # --- 2. Check ``content`` field (standard multimodal / DALL-E etc.) ---
    content = message.get("content")
    if not content:
        logger.warning(
            "Image response has no content and no images; message keys=%s",
            list(message.keys()),
        )
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


async def generate_image(
    prompt: str,
    model: str = None,
    size: str = "1024x1024",
    reference_image: str = "",
) -> str | None:
    """Generate an image via OpenRouter and return the image data URL.

    Uses the /chat/completions endpoint with modalities parameter,
    which is OpenRouter's unified approach for image generation.

    If ``reference_image`` is provided (a data URL or HTTP URL), it is included
    as a multimodal content part so the model can use it as visual reference.
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

    # Build message content – multimodal when reference image is provided
    if reference_image:
        content = [
            {"type": "text", "text": f"请参考以下图片的设计风格和布局来生成新的界面设计图。\n\n{prompt}"},
            {"type": "image_url", "image_url": {"url": reference_image}},
        ]
    else:
        content = prompt

    payload = {
        "model": image_model,
        "messages": [
            {"role": "user", "content": content},
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
                # Log response structure for debugging
                msg_keys = []
                choices = data.get("choices", [])
                if choices:
                    msg = choices[0].get("message", {})
                    msg_keys = list(msg.keys())
                logger.warning(
                    "Image generation returned no image (model=%s): "
                    "top_keys=%s, message_keys=%s",
                    image_model, list(data.keys()), msg_keys,
                )
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
