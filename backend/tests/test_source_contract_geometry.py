from app.source_contracts.enums import GeometryType, ValidationClassification
from app.source_contracts.geometry import GeometryValidator, GeometryValue

validator = GeometryValidator()


def _meta(geometry: GeometryValue):
    return validator.validate(geometry, provider_response_id="res-1")


def test_valid_point_and_line() -> None:
    point = GeometryValue(geometry_type=GeometryType.POINT, coordinates=[114.1, 22.2, 12.0], crs="EPSG:4326", dimensions=3)
    line = GeometryValue(
        geometry_type=GeometryType.LINE_STRING,
        coordinates=[[114.1, 22.2], [114.2, 22.3]],
        crs="EPSG:4326",
        dimensions=2,
    )
    assert _meta(point).valid
    assert _meta(line).valid


def test_geometry_failures_are_stable() -> None:
    invalid = GeometryValue(
        geometry_type=GeometryType.LINE_STRING,
        coordinates=[[114.1, 22.2]],
        crs="EPSG:9999",
        dimensions=2,
    )
    first = _meta(invalid)
    second = _meta(invalid)
    assert [(item.code, item.path) for item in first.findings] == [(item.code, item.path) for item in second.findings]
    assert first.findings[0].code == "geometry_crs_unsupported"
    assert first.provider_response_id == "res-1"
    assert all(item.classification is ValidationClassification.ERROR for item in first.findings)


def test_geometry_range_dimension_ring_and_empty_failures() -> None:
    out_of_range = GeometryValue(
        geometry_type=GeometryType.POINT,
        coordinates=[200.0, 22.2],
        crs="EPSG:4326",
        dimensions=2,
    )
    wrong_dimension = GeometryValue(
        geometry_type=GeometryType.POINT,
        coordinates=[114.1, 22.2, 4.0],
        crs="EPSG:4326",
        dimensions=2,
    )
    empty = GeometryValue(geometry_type=GeometryType.LINE_STRING, coordinates=[], crs="EPSG:4326", dimensions=2)
    open_ring = GeometryValue(
        geometry_type=GeometryType.POLYGON,
        coordinates=[[[114.1, 22.2], [114.2, 22.2], [114.2, 22.3], [114.15, 22.25]]],
        crs="EPSG:4326",
        dimensions=2,
    )
    assert _meta(out_of_range).findings[0].code == "geometry_coordinate_out_of_range"
    assert _meta(wrong_dimension).findings[0].code == "geometry_dimension_invalid"
    assert _meta(empty).findings[0].code == "geometry_empty"
    assert _meta(open_ring).findings[0].code == "geometry_ring_not_closed"
    assert not _meta(out_of_range).valid
