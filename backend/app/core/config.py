from __future__ import annotations

import os
from dataclasses import dataclass


def _csv(value: str) -> tuple[str, ...]:
    return tuple(item.strip() for item in value.split(",") if item.strip())


@dataclass(frozen=True, slots=True)
class Settings:
    app_name: str = "PathGuard API"
    app_env: str = "development"
    database_url: str = "postgresql://pathguard:pathguard@localhost:5432/pathguard"
    database_connect_timeout_seconds: int = 2
    allowed_origins: tuple[str, ...] = ("http://localhost:5173",)
    trusted_hosts: tuple[str, ...] = ("localhost", "127.0.0.1")
    max_request_body_bytes: int = 1_048_576

    @classmethod
    def from_env(cls) -> Settings:
        def default(name: str) -> object:
            # Slotted dataclass fields are member descriptors on the class.
            return cls.__dataclass_fields__[name].default

        return cls(
            app_name=os.getenv("APP_NAME", str(default("app_name"))),
            app_env=os.getenv("APP_ENV", str(default("app_env"))),
            database_url=os.getenv("DATABASE_URL", str(default("database_url"))),
            database_connect_timeout_seconds=int(
                os.getenv(
                    "DATABASE_CONNECT_TIMEOUT_SECONDS",
                    str(default("database_connect_timeout_seconds")),
                )
            ),
            allowed_origins=_csv(os.getenv("ALLOWED_ORIGINS", ",".join(default("allowed_origins")))),
            trusted_hosts=_csv(os.getenv("TRUSTED_HOSTS", ",".join(default("trusted_hosts")))),
            max_request_body_bytes=int(
                os.getenv("MAX_REQUEST_BODY_BYTES", str(default("max_request_body_bytes")))
            ),
        )

    def validate(self) -> None:
        if self.database_connect_timeout_seconds < 1:
            raise ValueError("DATABASE_CONNECT_TIMEOUT_SECONDS must be at least 1")
        if self.max_request_body_bytes < 1:
            raise ValueError("MAX_REQUEST_BODY_BYTES must be greater than 0")
        if not self.database_url.startswith(("postgresql://", "postgresql+psycopg://")):
            raise ValueError("DATABASE_URL must use a PostgreSQL connection URL")
        if self.app_env == "production" and any(
            value in {"*", "http://localhost:5173"} for value in self.allowed_origins
        ):
            raise ValueError("Production configuration must explicitly restrict ALLOWED_ORIGINS")
        if self.app_env == "production" and not self.trusted_hosts:
            raise ValueError("Production configuration must set TRUSTED_HOSTS")
