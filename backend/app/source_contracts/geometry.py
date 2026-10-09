from __future__ import annotations

import math
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.source_contracts.enums import GeometryType, ValidationClassification
from app.source_contracts.validation import ValidationFinding, ValidationMetadata, finding, metadata_from_findings

SUPPORTED_CRS: dict[str, dict[str, Any]] = {
    "EPSG:4326": {
        "ranges": ((-180.0, 180.0), (-90.0, 90.0), (-1000.0, 10000.0)),
    },
    "EPSG:2326": {
        "ranges": ((700000.0, 900000.0), (700000.0, 900000.0), (-100.0, 2000.0)),
    },
}

MAX_COORDINATES = 10_000


class GeometryValue(BaseModel):
    model_config = ConfigDict(extra="forbid")

    geometry_type: GeometryType
    coordinates: list[Any]
    crs: str = Field(min_length=1)
    dimensions: int = Field(ge=2, le=3)


class GeometryValidator:
    def validate(
        self,
        geometry: GeometryValue | None,
        *,
        path: str = "geometry",
        provider_response_id: str | None = None,
        provider_request_id: str | None = None,
        correlation_id: str | None = None,
    ) -> ValidationMetadata:
        findings: list[ValidationFinding] = []
        if geometry is None:
            findings.append(
                finding(
                    "geometry_empty",
                    path,
                    ValidationClassification.ERROR,
                    "Geometry is required and cannot be empty.",
                )
            )
        else:
            self._validate_geometry(geometry, path, findings)
        return metadata_from_findings(
            findings,
            provider_request_id=provider_request_id,
            provider_response_id=provider_response_id,
            correlation_id=correlation_id,
        )

    def _validate_geometry(
        self,
        geometry: GeometryValue,
        path: str,
        findings: list[ValidationFinding],
    ) -> None:
        if not geometry.crs.strip():
            findings.append(
                finding(
                    "geometry_crs_missing",
                    f"{path}.crs",
                    ValidationClassification.ERROR,
                    "Geometry must declare a coordinate reference system.",
                )
            )
            return
        crs = SUPPORTED_CRS.get(geometry.crs)
        if crs is None:
            findings.append(
                finding(
                    "geometry_crs_unsupported",
                    f"{path}.crs",
                    ValidationClassification.ERROR,
                    "Geometry coordinate reference system is not supported.",
                )
            )
            return
        if not geometry.coordinates:
            findings.append(
                finding(
                    "geometry_empty",
                    f"{path}.coordinates",
                    ValidationClassification.ERROR,
                    "Empty geometry cannot be published.",
                )
            )
            return
        ranges = crs["ranges"]
        counter = {"count": 0}
        if geometry.geometry_type is GeometryType.POINT:
            self._position(geometry.coordinates, geometry.dimensions, ranges, f"{path}.coordinates", findings, counter)
        elif geometry.geometry_type is GeometryType.LINE_STRING:
            positions = self._position_list(
                geometry.coordinates, geometry.dimensions, ranges, f"{path}.coordinates", findings, counter
            )
            if positions is not None and len(geometry.coordinates) < 2:
                findings.append(
                    finding(
                        "geometry_line_too_short",
                        f"{path}.coordinates",
                        ValidationClassification.ERROR,
                        "A line requires at least two positions.",
                    )
                )
        elif geometry.geometry_type is GeometryType.MULTI_LINE_STRING:
            if not isinstance(geometry.coordinates, list):
                self._structure(path, findings)
                return
            for index, line in enumerate(geometry.coordinates):
                line_path = f"{path}.coordinates[{index}]"
                positions = self._position_list(line, geometry.dimensions, ranges, line_path, findings, counter)
                if positions is not None and isinstance(line, list) and len(line) < 2:
                    findings.append(
                        finding(
                            "geometry_line_too_short",
                            line_path,
                            ValidationClassification.ERROR,
                            "A line requires at least two positions.",
                        )
                    )
        elif geometry.geometry_type is GeometryType.POLYGON:
            self._polygon(geometry.coordinates, geometry.dimensions, ranges, f"{path}.coordinates", findings, counter)
        elif geometry.geometry_type is GeometryType.MULTI_POLYGON:
            if not isinstance(geometry.coordinates, list) or not geometry.coordinates:
                self._structure(path, findings)
                return
            for index, polygon in enumerate(geometry.coordinates):
                self._polygon(
                    polygon,
                    geometry.dimensions,
                    ranges,
                    f"{path}.coordinates[{index}]",
                    findings,
                    counter,
                )
        else:
            findings.append(
                finding(
                    "geometry_type_invalid",
                    f"{path}.geometry_type",
                    ValidationClassification.ERROR,
                    "Geometry type is not supported.",
                )
            )
        if counter["count"] > MAX_COORDINATES:
            findings.append(
                finding(
                    "geometry_structure_invalid",
                    f"{path}.coordinates",
                    ValidationClassification.ERROR,
                    "Geometry exceeds the coordinate limit.",
                )
            )

    def _polygon(
        self,
        coordinates: Any,
        dimensions: int,
        ranges: tuple[tuple[float, float], ...],
        path: str,
        findings: list[ValidationFinding],
        counter: dict[str, int],
    ) -> None:
        if not isinstance(coordinates, list) or not coordinates:
            self._structure(path, findings)
            return
        for index, ring in enumerate(coordinates):
            ring_path = f"{path}[{index}]"
            parsed = self._position_list(ring, dimensions, ranges, ring_path, findings, counter)
            if parsed is None or not isinstance(ring, list):
                continue
            if len(ring) < 4:
                findings.append(
                    finding(
                        "geometry_ring_not_closed",
                        ring_path,
                        ValidationClassification.ERROR,
                        "A polygon ring must be closed and contain at least four positions.",
                    )
                )
                continue
            if ring[0] != ring[-1]:
                findings.append(
                    finding(
                        "geometry_ring_not_closed",
                        ring_path,
                        ValidationClassification.ERROR,
                        "A polygon ring must repeat its first position as its last position.",
                    )
                )

    def _position_list(
        self,
        coordinates: Any,
        dimensions: int,
        ranges: tuple[tuple[float, float], ...],
        path: str,
        findings: list[ValidationFinding],
        counter: dict[str, int],
    ) -> list[Any] | None:
        if not isinstance(coordinates, list) or not coordinates or not isinstance(coordinates[0], list):
            self._structure(path, findings)
            return None
        for index, position in enumerate(coordinates):
            self._position(position, dimensions, ranges, f"{path}[{index}]", findings, counter)
        return coordinates

    def _position(
        self,
        position: Any,
        dimensions: int,
        ranges: tuple[tuple[float, float], ...],
        path: str,
        findings: list[ValidationFinding],
        counter: dict[str, int],
    ) -> None:
        counter["count"] += 1
        if not isinstance(position, list) or any(isinstance(item, list) for item in position):
            self._structure(path, findings)
            return
        if len(position) != dimensions:
            findings.append(
                finding(
                    "geometry_dimension_invalid",
                    path,
                    ValidationClassification.ERROR,
                    "Coordinate dimensionality does not match the geometry declaration.",
                )
            )
            return
        for index, component in enumerate(position):
            if isinstance(component, bool) or not isinstance(component, (int, float)) or not math.isfinite(component):
                findings.append(
                    finding(
                        "geometry_not_finite",
                        f"{path}[{index}]",
                        ValidationClassification.ERROR,
                        "Coordinates must be finite numbers.",
                    )
                )
                continue
            low, high = ranges[index]
            if component < low or component > high:
                findings.append(
                    finding(
                        "geometry_coordinate_out_of_range",
                        f"{path}[{index}]",
                        ValidationClassification.ERROR,
                        "Coordinate is outside the declared coordinate reference system range.",
                    )
                )

    def _structure(self, path: str, findings: list[ValidationFinding]) -> None:
        findings.append(
            finding(
                "geometry_structure_invalid",
                path,
                ValidationClassification.ERROR,
                "Geometry coordinate structure does not match its type.",
            )
        )
