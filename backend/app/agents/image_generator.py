"""Image generation client via OpenRouter (chat completions with modalities)."""

import asyncio
import base64
import io
import logging
import re

import httpx
from PIL import Image

from app.config import settings

logger = logging.getLogger(__name__)

# Maximum dimension (width or height) for reference images sent to the API.
_MAX_REF_IMAGE_DIMENSION = 512
# JPEG quality for compressed reference images.
_REF_IMAGE_QUALITY = 60
# Maximum allowed size (in bytes) for the compressed reference image base64
# string.  Anything larger is dropped with a warning.
_MAX_REF_IMAGE_BASE64_BYTES = 500_000  # ~500 KB


def _compress_reference_image(data_url: str) -> str:
    """Compress and resize a base64 data-URL reference image.

    Large reference images can cause the upstream API server to disconnect
    because the JSON payload becomes too big.  This function decodes the
    data URL, resizes the image so its longest side is at most
    ``_MAX_REF_IMAGE_DIMENSION`` pixels, re-encodes it as JPEG, and returns
    a new ``data:image/jpeg;base64,...`` string.
    """
    try:
        # Parse the data URL header  ("data:image/png;base64,<payload>")
        header, encoded = data_url.split(",", 1)
        raw = base64.b64decode(encoded)

        img = Image.open(io.BytesIO(raw))
        img = img.convert("RGB")  # ensure no alpha channel for JPEG

        # Resize if larger than the limit
        w, h = img.size
        longest = max(w, h)
        if longest > _MAX_REF_IMAGE_DIMENSION:
            scale = _MAX_REF_IMAGE_DIMENSION / longest
            new_w = int(w * scale)
            new_h = int(h * scale)
            img = img.resize((new_w, new_h), Image.LANCZOS)
            logger.info(
                "Reference image resized from %dx%d to %dx%d",
                w, h, new_w, new_h,
            )

        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=_REF_IMAGE_QUALITY)
        compressed = base64.b64encode(buf.getvalue()).decode("ascii")

        original_kb = len(encoded) * 3 // 4 // 1024
        compressed_kb = len(compressed) * 3 // 4 // 1024
        logger.info(
            "Reference image compressed: ~%d KB -> ~%d KB",
            original_kb, compressed_kb,
        )

        # Safety check: if still too large, return empty to avoid upstream errors
        if len(compressed) > _MAX_REF_IMAGE_BASE64_BYTES:
            logger.warning(
                "Compressed reference image still too large (%d KB), dropping it",
                compressed_kb,
            )
            return ""

        return f"data:image/jpeg;base64,{compressed}"
    except Exception as e:
        logger.warning("Failed to compress reference image, using original: %s", e)
        return data_url


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
    Retries up to 2 times with exponential backoff on transient errors.
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
    use_reference = False
    if reference_image:
        # Compress reference image to avoid oversized payloads that cause
        # the upstream API server to disconnect.
        compressed_ref = _compress_reference_image(reference_image)
        if compressed_ref:
            content = [
                {"type": "text", "text": f"请参考以下图片的设计风格和布局来生成新的界面设计图。\n\n{prompt}"},
                {"type": "image_url", "image_url": {"url": compressed_ref}},
            ]
            use_reference = True
        else:
            # Compression returned empty (image too large), fall back to text-only
            logger.warning("Reference image too large after compression, generating without it")
            content = prompt
    else:
        content = prompt

    payload = {
        "model": image_model,
        "messages": [
            {"role": "user", "content": content},
        ],
        "modalities": ["image", "text"],
    }

    # Use granular timeouts: longer read timeout for image generation which
    # can take a while, especially with multimodal input.
    timeout = httpx.Timeout(connect=30, write=60, read=300, pool=30)

    max_retries = 2
    for attempt in range(max_retries + 1):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
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
            # Don't retry client errors (4xx)
            if e.response.status_code < 500:
                break
        except httpx.TimeoutException:
            logger.error("Image generation timed out (model=%s, attempt=%d)", image_model, attempt + 1)
        except Exception as e:
            err_str = str(e).lower()
            is_transient = any(kw in err_str for kw in (
                "incomplete", "connection", "closed", "chunked", "reset", "timeout",
            ))
            logger.error("Image generation failed (model=%s, attempt=%d): %s", image_model, attempt + 1, e)
            if not is_transient:
                # On the first attempt with a reference image, try once without it
                if use_reference and attempt == 0:
                    logger.info("Retrying without reference image after non-transient error")
                    payload["messages"][0]["content"] = prompt
                    use_reference = False
                    continue
                break

        if attempt < max_retries:
            wait = 2 ** (attempt + 1)  # 2s, 4s
            logger.info("Retrying image generation in %ds (attempt %d/%d)...", wait, attempt + 1, max_retries + 1)
            # On the last retry with a reference image, drop the reference to reduce payload
            if use_reference and attempt == max_retries - 1:
                logger.info("Dropping reference image for final retry to reduce payload size")
                payload["messages"][0]["content"] = prompt
                use_reference = False
            await asyncio.sleep(wait)

    return None
