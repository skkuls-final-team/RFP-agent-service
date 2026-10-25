from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=REPO_ROOT / ".env", extra="ignore")

    database_url: str = "postgresql://rfp:rfp@localhost:5433/rfp"
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-3.8-flash"
    migrations_dir: Path = REPO_ROOT / "db" / "migrations"
    seed_dir: Path = REPO_ROOT / "data" / "seed"
    # RFP 원문처럼 저장소에 올리지 않는 자료 (data/private/README.md)
    private_data_dir: Path = REPO_ROOT / "data" / "private"

    @property
    def docx_dir(self) -> Path:
        return self.private_data_dir / "rfp_docx"

    @property
    def upload_dir(self) -> Path:
        """화면에서 올린 RFP 원문 (git에 올리지 않는 data/private 아래)."""
        return self.private_data_dir / "uploads"

    @property
    def txt_dir(self) -> Path:
        """팀 추출 txt. 있으면 원문 위치 줄 번호를 이 txt에 맞춘다."""
        return self.private_data_dir / "rfp_txt"


@lru_cache
def get_settings() -> Settings:
    return Settings()
