from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.source_contracts.enums import FreshnessState, SourceKey
from app.source_contracts.failures import SafeFailure
from app.source_contracts.freshness import RefreshPolicy
from app.source_contracts.timeutil import require_utc


class SourceHealth(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_key: SourceKey
    last_successful_fetch_at: datetime | None = None
    last_attempted_fetch_at: datetime | None = None
    last_failure: SafeFailure | None = None
    data_age_seconds: int | None = Field(default=None, ge=0)
    freshness_state: FreshnessState
    last_successful_publication_id: UUID | None = None

    def normalized(self) -> "SourceHealth":
        success = self.last_successful_fetch_at
        attempted = self.last_attempted_fetch_at
        if success is not None:
            success = require_utc(success, "last_successful_fetch_at")
        if attempted is not None:
            attempted = require_utc(attempted, "last_attempted_fetch_at")
        return self.model_copy(
            update={"last_successful_fetch_at": success, "last_attempted_fetch_at": attempted}
        )
