from __future__ import annotations

from typing import Protocol

from pydantic import BaseModel, ConfigDict, Field

from app.source_contracts.enums import ValidationClassification


class ValidationFinding(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=1, pattern=r"^[a-z0-9_]+$")
    path: str = Field(min_length=1)
    classification: ValidationClassification
    detail: str = Field(min_length=1, max_length=512)


class ValidationMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    valid: bool
    findings: list[ValidationFinding] = Field(default_factory=list)
    provider_request_id: str | None = None
    provider_response_id: str | None = None
    correlation_id: str | None = None

    def error_findings(self) -> list[ValidationFinding]:
        return [
            finding
            for finding in self.findings
            if finding.classification is ValidationClassification.ERROR
        ]


def order_findings(findings: list[ValidationFinding]) -> list[ValidationFinding]:
    return sorted(findings, key=lambda finding: (finding.path, finding.code))


def metadata_from_findings(
    findings: list[ValidationFinding],
    *,
    provider_request_id: str | None = None,
    provider_response_id: str | None = None,
    correlation_id: str | None = None,
) -> ValidationMetadata:
    ordered = order_findings(findings)
    valid = not any(finding.classification is ValidationClassification.ERROR for finding in ordered)
    return ValidationMetadata(
        valid=valid,
        findings=ordered,
        provider_request_id=provider_request_id,
        provider_response_id=provider_response_id,
        correlation_id=correlation_id,
    )


def finding(
    code: str,
    path: str,
    classification: ValidationClassification,
    detail: str,
) -> ValidationFinding:
    return ValidationFinding(code=code, path=path, classification=classification, detail=detail)


class ContractValidator(Protocol):
    def validate_source_record(self, record: object) -> ValidationMetadata: ...

    def validate_csdi_route(self, result: object) -> ValidationMetadata: ...

    def validate_handoff(self, submission: object) -> ValidationMetadata: ...
