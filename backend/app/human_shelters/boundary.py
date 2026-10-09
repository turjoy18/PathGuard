from __future__ import annotations

# Inclusive prototype bounding box for Central Hong Kong.
# This is the import boundary for the pilot. It is not an official district polygon.
WEST = 114.1450
EAST = 114.1750
SOUTH = 22.2750
NORTH = 22.2900


def inside_pilot(longitude: float, latitude: float) -> bool:
    return WEST <= longitude <= EAST and SOUTH <= latitude <= NORTH
