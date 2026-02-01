import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    DEEPSEEK_API_KEY: str = os.getenv("DEEPSEEK_API_KEY", "")
    DEEPSEEK_BASE_URL: str = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
    DEEPSEEK_MODEL: str = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
    GLM_IMAGE_API_KEY: str = os.getenv("GLM_IMAGE_API_KEY", "")
    GLM_IMAGE_BASE_URL: str = os.getenv(
        "GLM_IMAGE_BASE_URL",
        "https://open.bigmodel.cn/api/paas/v4/images/generations",
    )
    GLM_IMAGE_MODEL: str = os.getenv("GLM_IMAGE_MODEL", "cogview-3")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./productor.db")
    OUTPUT_DIR: str = os.getenv("OUTPUT_DIR", "./output")


settings = Settings()
