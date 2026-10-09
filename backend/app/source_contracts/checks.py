from __future__ import annotations

from app.source_contracts.enums import (
    AccessibilityState,
    ContractStatus,
    RecordType,
    SourceKey,
    ValidationClassification,
    ValuePresence,
)
from app.source_contracts.geometry import GeometryValidator
from app.source_contracts.handoff import AdapterSubmission
from app.source_contracts.models import (
    ACCESSIBILITY_FACTS,
    SAFETY_FACTS,
    CSDIRouteResult,
    SourceRecord,
)
from app.source_contracts.validation import (
    ValidationFinding,
    ValidationMetadata,
    finding,
    metadata_from_findings,
)
from app.source_contracts.values import unknown_fact
from app.source_contracts.version import CONTRACT_VERSION

_MAX_STEPS = 500
_geometry = GeometryValidator()


class DefaultContractValidator:
    def validate_source_record(self, record: SourceRecord) -> ValidationMetadata:
        findings: list[ValidationFinding] = []
        self._version(record.contract_version, findings)
        self._provenance(record.provenance.source_name, findings)
        if record.source is SourceKey.MARINE_DEPARTMENT and record.record_type is RecordType.HUMAN_SHELTER:
            findings.append(
                finding(
                    "source_type_conflict",
                    "record_type",
                    ValidationClassification.ERROR,
                    "A Marine Department record cannot be classified as a human shelter.",
                )
            )
        if record.record_type is RecordType.HUMAN_SHELTER and record.source is SourceKey.MARINE_DEPARTMENT:
            pass
        if record.geometry is not None:
            findings.extend(
                _geometry.validate(
                    record.geometry,
                    provider_response_id=record.validation.provider_response_id,
                ).findings
            )
        self._unknown_safety_facts(record, findings)
        return metadata_from_findings(
            findings,
            provider_request_id=record.validation.provider_request_id,
            provider_response_id=record.validation.provider_response_id,
            correlation_id=record.validation.correlation_id,
        )

    def validate_csdi_route(self, result: CSDIRouteResult) -> ValidationMetadata:
        findings: list[ValidationFinding] = []
        self._version(result.contract_version, findings)
        self._provenance(result.provenance.source_name, findings)
        if result.steps is not None and len(result.steps) > _MAX_STEPS:
            findings.append(
                finding(
                    "required_route_field_missing",
                    "steps",
                    ValidationClassification.ERROR,
                    "Route steps exceed the contract limit.",
                )
            )
        if result.contract_status is ContractStatus.ROUTE_RETURNED:
            self._required_route(result, findings)
            if result.geometry is not None:
                geometry_meta = _geometry.validate(
                    result.geometry,
                    provider_response_id=result.provider_response_id,
                    provider_request_id=result.provider_request_id,
                    correlation_id=result.validation.correlation_id,
                )
                findings.extend(geometry_meta.findings)
            else:
                findings.append(
                    finding(
                        "required_route_field_missing",
                        "geometry",
                        ValidationClassification.ERROR,
                        "A returned route requires valid geometry.",
                    )
                )
        elif result.contract_status in {ContractStatus.ROUTE_UNAVAILABLE, ContractStatus.ROUTE_UNKNOWN}:
            self._no_fabricated_route(result, findings)
        self._accessibility(result, findings)
        return metadata_from_findings(
            findings,
            provider_request_id=result.provider_request_id,
            provider_response_id=result.provider_response_id,
            correlation_id=result.validation.correlation_id,
        )

    def validate_handoff(self, submission: AdapterSubmission) -> ValidationMetadata:
        findings: list[ValidationFinding] = []
        if submission.provenance.contract_version != CONTRACT_VERSION:
            findings.append(
                finding(
                    "mode_invalid",
                    "provenance.contract_version",
                    ValidationClassification.ERROR,
                    "The shared contract version is not supported.",
                )
            )
        result = submission.normalization_result
        if isinstance(result, CSDIRouteResult):
            findings.extend(self.validate_csdi_route(result).findings)
        elif isinstance(result, SourceRecord):
            findings.extend(self.validate_source_record(result).findings)
        elif submission.failure is None:
            findings.append(
                finding(
                    "required_route_field_missing",
                    "normalization_result",
                    ValidationClassification.ERROR,
                    "A handoff requires a normalized result or a safe failure.",
                )
            )
        return metadata_from_findings(
            [*submission.validation.findings, *findings],
            provider_request_id=submission.validation.provider_request_id,
            provider_response_id=submission.validation.provider_response_id,
            correlation_id=submission.validation.correlation_id,
        )

    def _version(self, contract_version: str, findings: list[ValidationFinding]) -> None:
        if contract_version != CONTRACT_VERSION:
            findings.append(
                finding(
                    "mode_invalid",
                    "contract_version",
                    ValidationClassification.ERROR,
                    "The shared contract version is not supported.",
                )
            )

    def _provenance(self, source_name: str, findings: list[ValidationFinding]) -> None:
        if not source_name.strip():
            findings.append(
                finding(
                    "source_name_required",
                    "provenance.source_name",
                    ValidationClassification.ERROR,
                    "Provenance requires a source name.",
                )
            )

    def _required_route(self, result: CSDIRouteResult, findings: list[ValidationFinding]) -> None:
        required = {
            "origin": result.origin,
            "destination": result.destination,
            "steps": result.steps,
            "distance_meters": result.distance_meters,
            "duration_seconds": result.duration_seconds,
            "provider_identity": result.provider_identity,
            "provenance": result.provenance,
        }
        for path, value in required.items():
            if value is None or (path == "steps" and value == []):
                findings.append(
                    finding(
                        "required_route_field_missing",
                        path,
                        ValidationClassification.ERROR,
                        f"A returned route requires {path}.",
                    )
                )
        if result.origin is not None:
            findings.extend(_geometry.validate(result.origin.geometry, path="origin.geometry").findings)
        if result.destination is not None:
            findings.extend(
                _geometry.validate(result.destination.geometry, path="destination.geometry").findings
            )

    def _no_fabricated_route(self, result: CSDIRouteResult, findings: list[ValidationFinding]) -> None:
        fabricated = {
            "geometry": result.geometry,
            "steps": result.steps,
            "distance_meters": result.distance_meters,
            "duration_seconds": result.duration_seconds,
        }
        for path, value in fabricated.items():
            if value is not None:
                findings.append(
                    finding(
                        "fabricated_route_field",
                        path,
                        ValidationClassification.WARNING,
                        "Route fields supplied for a non-route outcome are discarded.",
                    )
                )

    def _accessibility(self, result: CSDIRouteResult, findings: list[ValidationFinding]) -> None:
        check = result.accessibility_check
        if check.state is AccessibilityState.PASSED:
            for fact in ACCESSIBILITY_FACTS:
                attribute = check.attributes.get(fact)
                if attribute is None or attribute.state is not ValuePresence.KNOWN:
                    findings.append(
                        finding(
                            "accessibility_not_passed",
                            f"accessibility_check.attributes.{fact}",
                            ValidationClassification.UNKNOWN_VALUE,
                            "A missing accessibility fact cannot be reported as passed.",
                        )
                    )

    def _unknown_safety_facts(self, record: SourceRecord, findings: list[ValidationFinding]) -> None:
        if record.record_type is not RecordType.TYPHOON_SHELTER_REFERENCE:
            return
        for fact in SAFETY_FACTS:
            attribute = record.attributes.get(fact)
            if attribute is None:
                findings.append(
                    finding(
                        "source_fact_unknown",
                        f"attributes.{fact}",
                        ValidationClassification.UNKNOWN_VALUE,
                        "The source did not provide this fact.",
                    )
                )
                continue
            state = getattr(attribute, "state", None)
            if state is None and isinstance(attribute, dict):
                state = attribute.get("state")
            if state in {ValuePresence.UNKNOWN, "unknown", None}:
                findings.append(
                    finding(
                        "source_fact_unknown",
                        f"attributes.{fact}",
                        ValidationClassification.UNKNOWN_VALUE,
                        "The source fact remains unknown.",
                    )
                )


def normalize_accessibility(result: CSDIRouteResult) -> CSDIRouteResult:
    attributes = dict(result.accessibility_check.attributes)
    for fact in ACCESSIBILITY_FACTS:
        if fact not in attributes:
            attributes[fact] = unknown_fact("Source did not provide this accessibility fact.")
    state = result.accessibility_check.state
    if state is AccessibilityState.PASSED and any(
        attributes[fact].state is not ValuePresence.KNOWN for fact in ACCESSIBILITY_FACTS
    ):
        state = AccessibilityState.NOT_EVALUATED
    check = result.accessibility_check.model_copy(update={"state": state, "attributes": attributes})
    return result.model_copy(update={"accessibility_check": check})


def normalize_safety_attributes(record: SourceRecord) -> SourceRecord:
    if record.record_type is not RecordType.TYPHOON_SHELTER_REFERENCE:
        return record
    attributes = dict(record.attributes)
    for fact in SAFETY_FACTS:
        current = attributes.get(fact)
        if current is None:
            attributes[fact] = unknown_fact("Source did not provide this fact.").model_dump(mode="json")
        elif hasattr(current, "model_dump"):
            attributes[fact] = current.model_dump(mode="json")
    return record.model_copy(update={"attributes": attributes})
