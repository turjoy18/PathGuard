from __future__ import annotations

import json

from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.source_contracts.registry import initial_registry_entries, seed_timestamp


def seed_registry(connection: Connection) -> None:
    """Insert the three official sources once. Later runs do not overwrite operator settings."""

    created_at = seed_timestamp()
    statement = text(
        """
        INSERT INTO source_registry (
            source_key, source_name, authority, base_url, terms_url, attribution,
            refresh_policy_json, enabled, created_at, updated_at
        ) VALUES (
            :source_key, :source_name, :authority, :base_url, :terms_url, :attribution,
            CAST(:refresh_policy_json AS jsonb), :enabled, :created_at, :updated_at
        )
        ON CONFLICT (source_key) DO NOTHING
        """
    )
    for entry in initial_registry_entries():
        connection.execute(
            statement,
            {
                "source_key": entry.source_key.value,
                "source_name": entry.source_name,
                "authority": entry.authority,
                "base_url": str(entry.base_url),
                "terms_url": str(entry.terms_url),
                "attribution": entry.attribution,
                "refresh_policy_json": json.dumps(entry.refresh_policy.model_dump(mode="json")),
                "enabled": entry.enabled,
                "created_at": created_at,
                "updated_at": created_at,
            },
        )
