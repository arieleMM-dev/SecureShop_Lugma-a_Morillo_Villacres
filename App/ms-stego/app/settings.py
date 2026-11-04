from pathlib import Path
from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')
    auth_base_url: str = 'https://localhost:3443'
    auth_ca_path: Path = Path('secrets/ca.crt')
    auth_public_key_path: Path = Path('secrets/jwt-public.pem')
    auth_service_token: str = Field(min_length=64, pattern=r'^[a-f0-9]+$')
    auth_jwt_issuer: str = 'auth-service'
    auth_jwt_audience: str = 'chat-backend'
    auth_timeout: float = Field(default=3.0, gt=0, le=10)
    data_dir: Path = Path('data')
    max_file_bytes: int = Field(default=5242880, ge=1024, le=10485760)
    max_pixels: int = Field(default=4194304, ge=4096, le=16777216)
    max_dimension: int = Field(default=2048, ge=64, le=4096)
    worker_timeout: float = Field(default=10.0, gt=0, le=30)
    worker_memory_mb: int = Field(default=512, ge=256, le=1024)
    max_jobs: int = Field(default=2, ge=1, le=2)
    quarantine_days: int = Field(default=7, ge=1, le=30)
    require_sandbox: bool = True
    @model_validator(mode='after')
    def safe_channel(self):
        from urllib.parse import urlsplit
        u=urlsplit(self.auth_base_url)
        if u.scheme != 'https' or not u.hostname or u.username or u.password or u.query or u.fragment or u.path not in ('','/'):
            raise ValueError('AUTH_BASE_URL debe ser un origen HTTPS de configuración, sin credenciales ni parámetros')
        return self
