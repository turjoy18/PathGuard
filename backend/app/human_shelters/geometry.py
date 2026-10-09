from __future__ import annotations

from dataclasses import dataclass

from pydantic import ValidationError

from app.human_shelters.constants import CATALOGUE_SRID
from app.source_contracts.enums import GeometryType, ValidationClassification
from app.source_contracts.geometry import GeometryValidator, GeometryValue
from app.source_contracts.validation import ValidationFinding, finding

_validator = GeometryValidator()
_to_catalogue = None


@dataclass(frozen=True, slots=True)
class NormalizedPoint:
    longitude: float
    latitude: float
    srid: int
    source_crs: str


def _transformer():
    global _to_catalogue
    if _to_catalogue is None:
        from pyproj import Transformer

        _to_catalogue = Transformer.from_crs("EPSG:2326", "EPSG:4326", always_xy=True)
    return _to_catalogue


def normalize_point(raw: object, path: str) -> tuple[NormalizedPoint | None, list[ValidationFinding]]:
    """Validate a point with the shared geometry contract and store it as EPSG:4326."""

    findings: list[ValidationFinding] = []
    if not isinstance(raw, dict):
        return None, [
            finding(
                "geometry_invalid",
                path,
                ValidationClassification.ERROR,
                "Geometry must be a point object.",
            )
        ]
    extra = sorted(set(raw) - {"geometry_type", "coordinates", "crs", "dimensions"})
    for key in extra:
        findings.append(
            finding(
                "unsupported_field",
                f"{path}.{key}",
                ValidationClassification.ERROR,
                "Field is not supported.",
            )
        )
    geometry_type = raw.get("geometry_type")
    if geometry_type != GeometryType.POINT.value:
        findings.append(
            finding(
                "geometry_not_point",
                f"{path}.geometry_type",
                ValidationClassification.ERROR,
                "Human-shelter geometry must be a point.",
            )
        )
        return None, findings
    if raw.get("dimensions") != 2:
        findings.append(
            finding(
                "geometry_dimension_invalid",
                f"{path}.dimensions",
                ValidationClassification.ERROR,
                "Human-shelter points use two dimensions.",
            )
        )
        return None, findings
    try:
        geometry = GeometryValue.model_validate(raw)
    except ValidationError:
        findings.append(
            finding(
                "geometry_invalid",
                path,
                ValidationClassification.ERROR,
                "Geometry could not be read.",
            )
        )
        return None, findings
    shared = _validator.validate(geometry, path=path)
    shared_errors = shared.error_findings()
    if shared_errors:
        return None, findings + shared_errors
    longitude, latitude = _to_catalogue_lonlat(geometry, path, findings)
    if longitude is None or latitude is None:
        return None, findings
    return (
        NormalizedPoint(
            longitude=longitude,
            latitude=latitude,
            srid=CATALOGUE_SRID,
            source_crs=geometry.crs,
        ),
        findings,
    )


def _to_catalogue_lonlat(
    geometry: GeometryValue,
    path: str,
    findings: list[ValidationFinding],
) -> tuple[float | None, float | None]:
    east_or_lon, north_or_lat = geometry.coordinates
    try:
        if geometry.crs == "EPSG:4326":
            return float(east_or_lon), float(north_or_lat)
        if geometry.crs == "EPSG:2326":
            longitude, latitude = _transformer().transform(east_or_lon, north_or_lat)
            return float(longitude), float(latitude)
    except Exception:
        findings.append(
            finding(
                "geometry_crs_invalid",
                f"{path}.crs",
                ValidationClassification.ERROR,
                "Geometry could not be normalized to the catalogue coordinate system.",
            )
        )
        return None, None
    findings.append(
        finding(
            "geometry_crs_unsupported",
            f"{path}.crs",
            ValidationClassification.ERROR,
            "Geometry coordinate reference system is not supported.",
        )
    )
    return None, None
