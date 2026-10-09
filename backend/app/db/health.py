from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import psycopg

from app.core.config import Settings


@dataclass(frozen=True, slots=True)
class DatabaseStatus:
    ready: bool
    postgis_version: str | None = None
    error_code: str | None = None


class DatabaseProbe(Protocol):
    def check(self) -> DatabaseStatus:
        """Return a safe readiness result without exposing connection details."""


class PostgresDatabaseProbe:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def check(self) -> DatabaseStatus:
        try:
            with psycopg.connect(
                self._settings.database_url,
                connect_timeout=self._settings.database_connect_timeout_seconds,
            ) as connection:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT PostGIS_Full_Version()")
                    row = cursor.fetchone()
            version = str(row[0]) if row and row[0] else None
            if not version:
                return DatabaseStatus(ready=False, error_code="postgis_unavailable")
            return DatabaseStatus(ready=True, postgis_version=version)
        except psycopg.OperationalError:
            return DatabaseStatus(ready=False, error_code="database_unavailable")
        except (psycopg.Error, TypeError, ValueError):
            return DatabaseStatus(ready=False, error_code="database_check_failed")
