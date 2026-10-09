from __future__ import annotations

from collections.abc import Callable
from typing import Any, Generic, Self, TypeVar

from pydantic import BaseModel, ConfigDict, model_serializer, model_validator

from app.source_contracts.enums import ValuePresence

T = TypeVar("T")


class ValueState(BaseModel, Generic[T]):
    """Known fact, or an explicit unknown/unavailable state with no fabricated value."""

    model_config = ConfigDict(extra="forbid")

    state: ValuePresence
    value: T | None = None
    explanation: str | None = None

    @model_validator(mode="after")
    def enforce_presence(self) -> Self:
        if self.state is ValuePresence.KNOWN and self.value is None:
            raise ValueError("known state requires a value")
        if self.state is not ValuePresence.KNOWN and self.value is not None:
            raise ValueError("unknown and unavailable states cannot carry a value")
        return self

    @model_serializer(mode="wrap")
    def serialize_without_fabricated_value(
        self,
        serializer: Callable[[Self], dict[str, Any]],
    ) -> dict[str, Any]:
        payload = serializer(self)
        if self.state is not ValuePresence.KNOWN:
            payload.pop("value", None)
        return payload


def unknown_fact(explanation: str) -> ValueState[Any]:
    return ValueState(state=ValuePresence.UNKNOWN, explanation=explanation)


def unavailable_fact(explanation: str) -> ValueState[Any]:
    return ValueState(state=ValuePresence.UNAVAILABLE, explanation=explanation)
