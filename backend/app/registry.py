from __future__ import annotations

from collections.abc import Iterable

from fastapi import APIRouter, FastAPI


class FeatureRegistry:
    """Small registration boundary shared by independently owned feature modules."""

    def __init__(self) -> None:
        self._routers: list[tuple[APIRouter, str, list[str] | None]] = []

    def register(
        self,
        router: APIRouter,
        *,
        prefix: str = "",
        tags: Iterable[str] | None = None,
    ) -> None:
        self._routers.append((router, prefix, list(tags) if tags is not None else None))

    def include_in(self, application: FastAPI) -> None:
        for router, prefix, tags in self._routers:
            application.include_router(router, prefix=prefix, tags=tags)
