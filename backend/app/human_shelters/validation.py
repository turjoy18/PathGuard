from __future__ import annotations

import re
from datetime import date, datetime
from uuid import uuid4

from pydantic import ValidationError

from app.human_shelters.boundary import inside_pilot
from app.human_shelters.constants import (
    CAPACITY_STATES,
    CATALOGUE_LABEL,
    DATA_CLASSIFICATION,
    FACILITY_FIELDS,
    FACILITY_KEYS,
    FACILITY_STATES,
    FIXTURE_FIELDS,
    MAX_RECORDS,
    MAX_TEXT_LENGTH,
    OPERATING_STATUSES,
    PILOT_AREA,
    PROTOTYPE_MODES,
    RECORD_FIELDS,
    SCHEMA_VERSION,
)
from app.human_shelters.freshness import evaluate_facility_freshness, evaluate_record_freshness
from app.human_shelters.geometry import normalize_point
from app.human_shelters.models import (
    CataloguePublication,
    Entrance,
    FacilityEvidence,
    ShelterRecord,
)
from app.source_contracts.enums import (
    FreshnessState,
    OperatingMode,
    RecordType,
    ValidationClassification,
)
from app.source_contracts.provenance import ProvenanceEnvelope
from app.source_contracts.timeutil import require_utc
from app.source_contracts.validation import ValidationFinding, finding

_STABLE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def validate_fixture(
    payload: object,
    now: datetime,
) -> tuple[CataloguePublication | None, list[ValidationFinding]]:
    findings: list[ValidationFinding] = []
    now = require_utc(now, "now")
    if not isinstance(payload, dict):
        return None, [
            finding(
                "malformed_fixture",
                "fixture",
                ValidationClassification.ERROR,
                "Catalogue import must be an object.",
            )
        ]
    _reject_unknown(payload, FIXTURE_FIELDS, "fixture", findings)
    texts = {
        "fixture_name": payload.get("fixture_name"),
        "fixture_version": payload.get("fixture_version"),
        "owner": payload.get("owner"),
        "source_url": payload.get("source_url"),
        "attribution": payload.get("attribution"),
        "coverage": payload.get("coverage"),
        "limitations": payload.get("limitations"),
        "verification_method": payload.get("verification_method"),
    }
    for name, value in texts.items():
        _required_text(value, name, findings)
    if payload.get("schema_version") != SCHEMA_VERSION:
        findings.append(
            finding(
                "schema_version_invalid",
                "schema_version",
                ValidationClassification.ERROR,
                "Fixture schema version is not supported.",
            )
        )
    if payload.get("label") != CATALOGUE_LABEL:
        findings.append(
            finding(
                "catalogue_label_invalid",
                "label",
                ValidationClassification.ERROR,
                "Fixture label must identify the prototype catalogue.",
            )
        )
    if payload.get("pilot_area") != PILOT_AREA:
        findings.append(
            finding(
                "pilot_area_invalid",
                "pilot_area",
                ValidationClassification.ERROR,
                "Fixture pilot area must be Central Hong Kong.",
            )
        )
    if payload.get("data_classification") != DATA_CLASSIFICATION:
        findings.append(
            finding(
                "data_classification_invalid",
                "data_classification",
                ValidationClassification.ERROR,
                "Prototype fixtures must be classified as mock demo data.",
            )
        )
    if payload.get("official_citywide") is not False:
        findings.append(
            finding(
                "coverage_claim",
                "official_citywide",
                ValidationClassification.ERROR,
                "Prototype fixtures cannot claim official citywide coverage.",
            )
        )
    coverage = payload.get("coverage")
    if isinstance(coverage, str) and _claims_citywide(coverage):
        findings.append(
            finding(
                "coverage_claim",
                "coverage",
                ValidationClassification.ERROR,
                "Coverage text cannot describe this catalogue as citywide.",
            )
        )
    data_mode = payload.get("data_mode")
    if data_mode not in PROTOTYPE_MODES:
        findings.append(
            finding(
                "unsupported_data_mode",
                "data_mode",
                ValidationClassification.ERROR,
                "Prototype fixtures accept only snapshot or replay mode.",
            )
        )
    publication_date = _publication_date(payload.get("publication_date"), findings)
    records = payload.get("records")
    built: list[ShelterRecord] = []
    if not isinstance(records, list):
        findings.append(
            finding(
                "malformed_fixture",
                "records",
                ValidationClassification.ERROR,
                "Fixture records must be a list.",
            )
        )
    elif not records or len(records) > MAX_RECORDS:
        findings.append(
            finding(
                "record_count_invalid",
                "records",
                ValidationClassification.ERROR,
                "A fixture version must contain 1 to 100 records.",
            )
        )
    else:
        _duplicates(records, findings)
        for index, raw in enumerate(records):
            record = _record(raw, index, data_mode, now, findings)
            if record is not None:
                built.append(record)
    if findings or publication_date is None or not isinstance(data_mode, str):
        return None, findings
    if len(built) != len(records):
        return None, findings
    publication = CataloguePublication(
        publication_id=uuid4(),
        schema_version=SCHEMA_VERSION,
        fixture_name=payload["fixture_name"],
        fixture_version=payload["fixture_version"],
        label=CATALOGUE_LABEL,
        pilot_area=PILOT_AREA,
        owner=payload["owner"],
        source_url=payload["source_url"],
        attribution=payload["attribution"],
        coverage=payload["coverage"],
        limitations=payload["limitations"],
        verification_method=payload["verification_method"],
        data_classification=DATA_CLASSIFICATION,
        official_citywide=False,
        data_mode=OperatingMode(data_mode),
        publication_date=publication_date,
        available=True,
        created_at=now,
        records=[stamp_freshness(record, now) for record in built],
    )
    return publication, []


def stamp_freshness(record: ShelterRecord, now: datetime) -> ShelterRecord:
    freshness = evaluate_record_freshness(
        fetched_at=record.provenance.fetched_at,
        issued_at=record.provenance.issued_at,
        valid_until=record.provenance.valid_until,
        last_verified_at=record.last_verified_at,
        now=now,
    )
    facilities = []
    for facility in record.facilities:
        facilities.append(
            facility.model_copy(
                update={
                    "evidence_freshness_state": evaluate_facility_freshness(
                        facility.verified_at,
                        now,
                    )
                }
            )
        )
    ordered = sorted(facilities, key=lambda item: FACILITY_KEYS.index(item.key))
    return record.model_copy(
        update={
            "freshness_state": freshness,
            "provenance": record.provenance.model_copy(update={"freshness_state": freshness}),
            "facilities": ordered,
        }
    )


def _record(
    raw: object,
    index: int,
    fixture_mode: object,
    now: datetime,
    findings: list[ValidationFinding],
) -> ShelterRecord | None:
    path = f"records[{index}]"
    local: list[ValidationFinding] = []
    if not isinstance(raw, dict):
        findings.append(
            finding(
                "malformed_record",
                path,
                ValidationClassification.ERROR,
                "Shelter record must be an object.",
            )
        )
        return None
    _reject_unknown(raw, RECORD_FIELDS, path, local)
    stable_id = raw.get("stable_id")
    if not isinstance(stable_id, str) or _STABLE_ID.fullmatch(stable_id) is None:
        local.append(
            finding(
                "required_field",
                f"{path}.stable_id",
                ValidationClassification.ERROR,
                "stable_id must be 1 to 128 supported characters.",
            )
        )
        stable_id = None
    record_type = raw.get("record_type")
    if record_type != RecordType.HUMAN_SHELTER.value:
        local.append(
            finding(
                "import_discriminator",
                f"{path}.record_type",
                ValidationClassification.ERROR,
                "Only human_shelter records can enter this catalogue.",
            )
        )
    for name in ("name", "address", "authority"):
        _required_text(raw.get(name), f"{path}.{name}", local)
    if raw.get("pilot_area") != PILOT_AREA:
        local.append(
            finding(
                "pilot_area_invalid",
                f"{path}.pilot_area",
                ValidationClassification.ERROR,
                "Record pilot area must be Central Hong Kong.",
            )
        )
    point, geometry_findings = normalize_point(raw.get("geometry"), f"{path}.geometry")
    local.extend(geometry_findings)
    if point is not None and not inside_pilot(point.longitude, point.latitude):
        shown = stable_id or f"index {index}"
        local.append(
            finding(
                "boundary_violation",
                f"{path}.geometry",
                ValidationClassification.ERROR,
                f"Record {shown} is outside the Central Hong Kong pilot boundary.",
            )
        )
    provenance = _provenance(raw.get("provenance"), path, fixture_mode, now, local)
    status = raw.get("operating_status", "unknown")
    if status not in OPERATING_STATUSES:
        local.append(
            finding(
                "enum_invalid",
                f"{path}.operating_status",
                ValidationClassification.ERROR,
                "operating_status must be open, closed, or unknown.",
            )
        )
        status = None
    last_verified = _timestamp(raw.get("last_verified_at"), f"{path}.last_verified_at", local)
    verified_already_reported = any(item.path.endswith(".last_verified_at") for item in local)
    if status in {"open", "closed"} and last_verified is None and not verified_already_reported:
        local.append(
            finding(
                "required_field",
                f"{path}.last_verified_at",
                ValidationClassification.ERROR,
                "last_verified_at is required when operating status is open or closed.",
            )
        )
    if last_verified is not None and last_verified > now:
        local.append(
            finding(
                "provenance_time_in_future",
                f"{path}.last_verified_at",
                ValidationClassification.ERROR,
                "last_verified_at cannot be later than the evaluation time.",
            )
        )
    capacity_state, capacity_source = _capacity(raw, path, local)
    facilities = _facilities(raw.get("facilities", []), path, now, local)
    entrances = _entrances(raw.get("entrances", []), path, local)
    findings.extend(local)
    if local or point is None or provenance is None or status is None or facilities is None:
        return None
    if not isinstance(stable_id, str):
        return None
    return ShelterRecord(
        shelter_id=uuid4(),
        stable_id=stable_id,
        record_type="human_shelter",
        name=raw["name"].strip(),
        address=raw["address"].strip(),
        authority=raw["authority"].strip(),
        pilot_area=PILOT_AREA,
        longitude=point.longitude,
        latitude=point.latitude,
        srid=point.srid,
        source_crs=point.source_crs,
        operating_status=status,
        capacity_state=capacity_state or "unknown",
        capacity_source=capacity_source,
        last_verified_at=last_verified,
        freshness_state=FreshnessState.UNKNOWN,
        entrances=entrances,
        provenance=provenance,
        facilities=facilities,
    )


def _provenance(
    raw: object,
    path: str,
    fixture_mode: object,
    now: datetime,
    findings: list[ValidationFinding],
) -> ProvenanceEnvelope | None:
    field_path = f"{path}.provenance"
    if not isinstance(raw, dict):
        findings.append(
            finding(
                "required_field",
                field_path,
                ValidationClassification.ERROR,
                "provenance is required.",
            )
        )
        return None
    for name in ("source_name", "source_record_id", "source_version"):
        value = raw.get(name)
        if not isinstance(value, str) or not value.strip():
            findings.append(
                finding(
                    "required_field",
                    f"{field_path}.{name}",
                    ValidationClassification.ERROR,
                    f"{name} is required.",
                )
            )
    mode = raw.get("mode")
    if mode not in PROTOTYPE_MODES:
        findings.append(
            finding(
                "unsupported_data_mode",
                f"{field_path}.mode",
                ValidationClassification.ERROR,
                "Prototype records accept only snapshot or replay mode.",
            )
        )
    elif fixture_mode in PROTOTYPE_MODES and mode != fixture_mode:
        findings.append(
            finding(
                "unsupported_data_mode",
                f"{field_path}.mode",
                ValidationClassification.ERROR,
                "Record mode must match the fixture data mode.",
            )
        )
    try:
        envelope = ProvenanceEnvelope.model_validate(raw)
    except ValidationError as exc:
        for error in exc.errors():
            location = ".".join(str(part) for part in error["loc"]) or "provenance"
            findings.append(
                finding(
                    "provenance_invalid",
                    f"{field_path}.{location}",
                    ValidationClassification.ERROR,
                    "Provenance field failed validation.",
                )
            )
        return None
    for name in ("fetched_at", "issued_at"):
        value = getattr(envelope, name)
        if value is not None and value > now:
            findings.append(
                finding(
                    "provenance_time_in_future",
                    f"{field_path}.{name}",
                    ValidationClassification.ERROR,
                    f"{name} cannot be later than the evaluation time.",
                )
            )
    if envelope.mode.value not in PROTOTYPE_MODES:
        return None
    return envelope


def _capacity(
    raw: dict,
    path: str,
    findings: list[ValidationFinding],
) -> tuple[str | None, str | None]:
    if "capacity_state" not in raw or raw.get("capacity_state") is None:
        source = raw.get("capacity_source")
        if source is not None and not isinstance(source, str):
            findings.append(
                finding(
                    "required_field",
                    f"{path}.capacity_source",
                    ValidationClassification.ERROR,
                    "capacity_source must be text when it is supplied.",
                )
            )
            return None, None
        return "unknown", source.strip() if isinstance(source, str) and source.strip() else None
    state = raw.get("capacity_state")
    if state not in CAPACITY_STATES:
        findings.append(
            finding(
                "enum_invalid",
                f"{path}.capacity_state",
                ValidationClassification.ERROR,
                "capacity_state must be available, unavailable, or unknown.",
            )
        )
        return None, None
    source = raw.get("capacity_source")
    if state != "unknown":
        if not isinstance(source, str) or not source.strip():
            findings.append(
                finding(
                    "required_field",
                    f"{path}.capacity_source",
                    ValidationClassification.ERROR,
                    "capacity_source is required when a capacity state is sourced.",
                )
            )
            return None, None
        return state, source.strip()
    if source is None:
        return "unknown", None
    if not isinstance(source, str) or not source.strip():
        findings.append(
            finding(
                "required_field",
                f"{path}.capacity_source",
                ValidationClassification.ERROR,
                "capacity_source must be text when it is supplied.",
            )
        )
        return None, None
    return "unknown", source.strip()


def _facilities(
    raw: object,
    path: str,
    now: datetime,
    findings: list[ValidationFinding],
) -> list[FacilityEvidence] | None:
    if raw is None:
        raw = []
    if not isinstance(raw, list):
        findings.append(
            finding(
                "malformed_record",
                f"{path}.facilities",
                ValidationClassification.ERROR,
                "Facilities must be a list.",
            )
        )
        return None
    parsed: dict[str, FacilityEvidence] = {}
    failed = False
    for index, item in enumerate(raw):
        item_path = f"{path}.facilities[{index}]"
        if not isinstance(item, dict):
            findings.append(
                finding(
                    "malformed_record",
                    item_path,
                    ValidationClassification.ERROR,
                    "Facility evidence must be an object.",
                )
            )
            failed = True
            continue
        _reject_unknown(item, FACILITY_FIELDS, item_path, findings)
        key = item.get("key")
        if key not in FACILITY_KEYS:
            findings.append(
                finding(
                    "unsupported_field",
                    f"{item_path}.key",
                    ValidationClassification.ERROR,
                    "Facility key is not supported.",
                )
            )
            failed = True
            continue
        if key in parsed:
            findings.append(
                finding(
                    "duplicate_facility",
                    f"{item_path}.key",
                    ValidationClassification.ERROR,
                    "Facility evidence is duplicated for this record.",
                )
            )
            failed = True
            continue
        state = item.get("state")
        if state not in FACILITY_STATES:
            findings.append(
                finding(
                    "facility_state_invalid",
                    f"{item_path}.state",
                    ValidationClassification.ERROR,
                    "Facility state must be yes, no, or unknown.",
                )
            )
            failed = True
            continue
        evidence = _facility_evidence(item, state, item_path, now, findings)
        if evidence is None:
            failed = True
            continue
        parsed[key] = evidence
    if failed:
        return None
    facilities = []
    for key in FACILITY_KEYS:
        facilities.append(
            parsed.get(
                key,
                FacilityEvidence(key=key, state="unknown"),
            )
        )
    return facilities


def _facility_evidence(
    item: dict,
    state: str,
    path: str,
    now: datetime,
    findings: list[ValidationFinding],
) -> FacilityEvidence | None:
    if state == "unknown":
        for name in ("evidence_source", "verified_at", "note"):
            if item.get(name) not in (None, ""):
                findings.append(
                    finding(
                        "facility_evidence_conflict",
                        f"{path}.{name}",
                        ValidationClassification.ERROR,
                        "Unknown facility state cannot carry verification evidence.",
                    )
                )
                return None
        return FacilityEvidence(key=item["key"], state="unknown")
    source = item.get("evidence_source")
    note = item.get("note")
    if not isinstance(source, str) or not source.strip() or not isinstance(note, str) or not note.strip():
        findings.append(
            finding(
                "facility_evidence_required",
                path,
                ValidationClassification.ERROR,
                "yes or no facility evidence requires an evidence source and note.",
            )
        )
        return None
    verified_path = f"{path}.verified_at"
    verified_at = _timestamp(item.get("verified_at"), verified_path, findings)
    if verified_at is None and not any(item.path == verified_path for item in findings):
        findings.append(
            finding(
                "facility_evidence_required",
                verified_path,
                ValidationClassification.ERROR,
                "yes or no facility evidence requires a verification timestamp.",
            )
        )
        return None
    if verified_at is None:
        return None
    if verified_at > now:
        findings.append(
            finding(
                "provenance_time_in_future",
                f"{path}.verified_at",
                ValidationClassification.ERROR,
                "Facility verification time cannot be later than the evaluation time.",
            )
        )
        return None
    return FacilityEvidence(
        key=item["key"],
        state=state,
        evidence_source=source.strip(),
        verified_at=verified_at,
        note=note.strip(),
        evidence_freshness_state=evaluate_facility_freshness(verified_at, now),
    )


def _entrances(raw: object, path: str, findings: list[ValidationFinding]) -> list[Entrance]:
    if raw is None:
        raw = []
    if not isinstance(raw, list):
        findings.append(
            finding(
                "malformed_record",
                f"{path}.entrances",
                ValidationClassification.ERROR,
                "Entrances must be a list.",
            )
        )
        return []
    entrances: list[Entrance] = []
    for index, item in enumerate(raw):
        item_path = f"{path}.entrances[{index}]"
        if not isinstance(item, dict):
            findings.append(
                finding(
                    "malformed_record",
                    item_path,
                    ValidationClassification.ERROR,
                    "Entrance must be an object.",
                )
            )
            continue
        _reject_unknown(item, {"name", "geometry"}, item_path, findings)
        name = item.get("name")
        if not isinstance(name, str) or not name.strip():
            findings.append(
                finding(
                    "required_field",
                    f"{item_path}.name",
                    ValidationClassification.ERROR,
                    "Entrance name is required.",
                )
            )
            continue
        point, geometry_findings = normalize_point(item.get("geometry"), f"{item_path}.geometry")
        findings.extend(geometry_findings)
        if point is None:
            continue
        if not inside_pilot(point.longitude, point.latitude):
            findings.append(
                finding(
                    "boundary_violation",
                    f"{item_path}.geometry",
                    ValidationClassification.ERROR,
                    "Entrance is outside the Central Hong Kong pilot boundary.",
                )
            )
            continue
        entrances.append(
            Entrance(
                name=name.strip(),
                longitude=point.longitude,
                latitude=point.latitude,
                srid=point.srid,
                source_crs=point.source_crs,
            )
        )
    return entrances


def _duplicates(records: list[object], findings: list[ValidationFinding]) -> None:
    seen: dict[str, int] = {}
    for index, raw in enumerate(records):
        if not isinstance(raw, dict) or not isinstance(raw.get("stable_id"), str):
            continue
        stable_id = raw["stable_id"]
        if stable_id in seen:
            findings.append(
                finding(
                    "duplicate_identifier",
                    f"records[{index}].stable_id",
                    ValidationClassification.ERROR,
                    f"Duplicate stable identifier {stable_id[:128]}.",
                )
            )
            continue
        seen[stable_id] = index


def _publication_date(value: object, findings: list[ValidationFinding]) -> date | None:
    if not isinstance(value, str) or _DATE.fullmatch(value) is None:
        findings.append(
            finding(
                "required_field",
                "publication_date",
                ValidationClassification.ERROR,
                "publication_date must be a YYYY-MM-DD date.",
            )
        )
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        findings.append(
            finding(
                "required_field",
                "publication_date",
                ValidationClassification.ERROR,
                "publication_date must be a real calendar date.",
            )
        )
        return None


def _timestamp(
    value: object,
    path: str,
    findings: list[ValidationFinding],
) -> datetime | None:
    if value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        findings.append(
            finding(
                "provenance_invalid",
                path,
                ValidationClassification.ERROR,
                "Timestamp must be an ISO-8601 UTC value.",
            )
        )
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return require_utc(parsed, path)
    except ValueError:
        findings.append(
            finding(
                "provenance_invalid",
                path,
                ValidationClassification.ERROR,
                "Timestamp must be timezone-aware UTC.",
            )
        )
        return None


def _required_text(value: object, path: str, findings: list[ValidationFinding]) -> None:
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > MAX_TEXT_LENGTH:
        findings.append(
            finding(
                "required_field",
                path,
                ValidationClassification.ERROR,
                f"{path.rsplit('.', 1)[-1]} is required.",
            )
        )


def _reject_unknown(
    payload: dict,
    allowed: set[str],
    path: str,
    findings: list[ValidationFinding],
) -> None:
    for key in sorted(set(payload) - allowed):
        findings.append(
            finding(
                "unsupported_field",
                f"{path}.{key}",
                ValidationClassification.ERROR,
                "Field is not supported.",
            )
        )


def _claims_citywide(coverage: str) -> bool:
    lowered = coverage.lower()
    if "citywide" not in lowered:
        return False
    return "not " not in lowered and "not citywide" not in lowered


