# CSDI 3D Pedestrian Route Search

Server-side adapter. Browsers call `POST /api/v1/routes/csdi` and never call CSDI.

## Source

- Endpoint: `https://mapapi.hkmapservice.gov.hk/PedRoute/NAServer/route/solve`
- Documentation: https://portal.csdi.gov.hk/csdi-webpage/apidoc/3d-pedestrian-route-search
- Authority: Lands Department, Hong Kong SAR Government
- Parameters: `stops` (origin and destination GeoJSON-like features), `travelMode=1`, `directionsLanguage` (`en`, `zh-HK`, `zh-CN`), `outSR=4326`, `f=json`, `returnZ=true`, `directionStyleName=NA Campus`
- CRS: request and response use EPSG:4326. EPSG:2326 is accepted by the provider but this adapter requests 4326 and does not convert coordinates.
- Authentication: none on the public Map API. Do not put tokens in the URL.
- Quota: the provider asks callers not to burst traffic and caps a response at 5000 records. PathGuard allows 30 guest requests per minute, times out at 8 seconds, retries twice with backoff, and caches a successful route for 60 seconds.
- Pilot coverage: Hong Kong 3D pedestrian network, indoor and outdoor. A route is not wheelchair-safe and not hazard-free.
- Attribution: © Lands Department, Hong Kong SAR Government. Common Spatial Data Infrastructure (CSDI).

## Modes

`PATHGUARD_CSDI_MODE=fixture` (default) returns a redacted local route or a no-route result when origin and destination are the same point. `live` calls the endpoint above. Neither mode draws a straight line when the provider returns no path.

## Errors

Timeout, rate limit, transport failure, malformed JSON, and invalid geometry become typed non-success results. Empty `routes.features` is `route_unavailable`.
