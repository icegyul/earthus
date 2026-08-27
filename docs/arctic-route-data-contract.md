# EARTHUS 2.0 — Arctic Route Intelligence Data Contract

Verified / reviewed: 2026-08-27
Target branch: `earthus-v2/actual-first-screen-preview`
Runtime: `prototype/v2/js/route-intelligence.js`

## 1. Product definition

Arctic Route Intelligence is a flagship Earthus Route Intelligence surface.

It is **not** a commercial AIS replacement and it must not imply that Earthus owns continuous live vessel positions.

Core experience:

`ROUTE / CORRIDOR + SEA ICE + SATELLITE + WEATHER + OCEAN + HAZARD + NEWS + HISTORY`

All environmental layers keep provider, product, observation/valid time and provenance state.

## 2. Geometry hard gate

### Northern Sea Route — NSR

Authoritative reference:

- Northern Sea Route General Administration / Rosatom
- Official NSR water-area definition:
  `https://nsr.rosatom.ru/en/official-information/boundaries-of-the-water-area-of-the-northern-sea-route/`
- Official legal/navigation context:
  `https://nsr.rosatom.ru/en/official-information/federal-law-dated-april-30-1999-nr-81-fz-merchant-shipping-code/`

Important product rule:

The authoritative material defines the NSR water area and the administration develops navigation routes with hydrometeorological, ice and navigational conditions. Earthus must therefore **not invent one immutable NSR polyline** and present it as the operational route.

Runtime geometry state:

- mode: `DYNAMIC_CORRIDOR`
- status: `AUTHORITATIVE_DYNAMIC_ROUTE_REQUIRED`

Until a legally reusable authoritative route/corridor geometry feed is integrated, Earthus may focus the Arctic region and show environmental conditions, but the `route line` control remains disabled.

### Northwest Passage — NWP

The NWP is a family of passages through the Canadian Arctic Archipelago rather than one immutable line.

Runtime geometry state:

- mode: `MULTI_CORRIDOR`
- status: `AUTHORITATIVE_GEOMETRY_REQUIRED`

Do not collapse the alternatives into one decorative line. Integrate a sourced corridor/reference dataset first, then preserve corridor identity/version/provenance.

### Transpolar corridor

This is not presented as an operational shipping route.

Runtime geometry state:

- mode: `CONCEPTUAL_CORRIDOR`
- status: `REFERENCE_REQUIRED`

Only a sourced long-range/reference geometry may be shown, with a clearly different visual language from operational/current route information.

## 3. Sea-ice and satellite source roles

### A. NASA Earthdata GIBS — live/recent visual layer

Official API documentation:

`https://nasa-gibs.github.io/gibs-api-docs/access-basics/`

GIBS exposes standards-based WMTS/WMS services and supports a time dimension. If time is omitted or `default` is requested, GIBS returns the layer default date. Earthus should resolve the latest available date when possible and must never label `today` when the provider only has an older available acquisition/product date.

#### Sea ice

- Provider: NASA Earthdata GIBS
- Product: GCOM-W1 / AMSR2 Sea Ice Concentration (12 km)
- GIBS identifier used by the runtime: `AMSRU2_Sea_Ice_Concentration_12km`
- Earthus class: `SATELLITE_OBSERVATION`
- Current use: direct visual overlay on the Earthus Cesium viewer
- Loading: shared Earthus Resource Task runtime

#### Optical satellite

- Provider: NASA Earthdata GIBS / Worldview
- Product: NOAA-20 / VIIRS Corrected Reflectance True Color
- GIBS identifier: `VIIRS_NOAA20_CorrectedReflectance_TrueColor`
- Earthus class: `SATELLITE_IMAGERY`
- Current use: direct visual overlay on the Earthus Cesium viewer
- Polar limitation: optical imagery can be obscured by cloud and seasonal darkness; it must not be treated as the sole operational ice source.

### B. NOAA / NSIDC Sea Ice Index v4 — baseline/history/comparison

Official dataset:

`https://nsidc.org/data/g02135/versions/4`

Archive:

`https://noaadata.apps.nsidc.org/NOAA/G02135/`

Dataset ID: `G02135`

Role in Earthus:

- Arctic-wide consistent historical comparison
- daily and monthly sea-ice concentration/extent context
- seasonal and year-over-year comparison
- climatology/trend support
- not a replacement for higher-resolution operational/navigation products

Known product characteristics reviewed for this contract:

- Version 4
- daily/monthly products
- sea-ice concentration and extent
- 25 km class product for the Sea Ice Index grid
- data citation/acknowledgment required by the dataset documentation

Client display must retain product version and source. A future server adapter should normalize GeoTIFF/CSV/PNG into the Earthus provenance schema instead of parsing large scientific products repeatedly on phones.

### C. Copernicus Marine / OSI SAF — advanced observation layer

Product:

`SEAICE_GLO_SEAICE_L4_NRT_OBSERVATIONS_011_001`

Official product page:

`https://data.marine.copernicus.eu/product/SEAICE_GLO_SEAICE_L4_NRT_OBSERVATIONS_011_001/description`

Role:

- sea-ice concentration
- edge/type products where exposed by the selected dataset/version
- drift/context products when supported
- advanced Route Intelligence and cross-checking

Runtime access state:

`SERVER_ADAPTER_REQUIRED`

Do not embed account tokens or Copernicus credentials in the Earthus client. Retrieval, normalization, caching, provenance and licensing checks belong in the Earthus server/provider layer.

### D. Sentinel-1 SAR — high-value Arctic imagery

Provider entry:

- Copernicus Data Space Ecosystem
- Sentinel-1 SAR

Role:

- radar context for polar areas
- useful where optical imagery is limited by cloud or darkness
- future advanced/premium visual investigation layer

Runtime access state:

`AUTH_PROCESSING_REQUIRED`

Earthus must not pretend a generic optical image is SAR. SAR acquisition, processing level, pass/acquisition time and source product must be retained.

## 4. Runtime loading contract

Arctic data uses the existing `window.EarthusTasks` contract.

Resource IDs:

- `arctic-sea-ice`
- `arctic-satellite-optical`

Expected loading stages:

`metadata → provider → attach → render → ready`

Rules:

- stale request replacement uses a generation guard
- AbortSignal is respected
- retry creates a new Resource Task
- unknown measurable work becomes indeterminate instead of fake percentage
- previous visible layer is removed only after replacement is attached/rendered
- source/time evidence is dispatched through `earthus:v2-layer-ready`

## 5. Time/provenance contract

Every Arctic layer exposed to Route Intelligence should carry:

- `source`
- `product`
- `observedAt` or `validAt` when resolved
- `timeMode`: `RESOLVED` or `PROVIDER_DEFAULT` when exact client metadata resolution failed
- `provenance`
- `credit`

The UI must not convert `PROVIDER_DEFAULT` into an invented exact acquisition date.

## 6. Route status safety gate

Environmental evidence must not automatically generate operational navigation states such as:

- `OPEN`
- `CLOSED`
- `SAFE`
- `NAVIGABLE`
- `RECOMMENDED ROUTE`

An operational state requires an authoritative operational source explicitly supporting that state and a documented validity time.

Weather, sea ice, satellite imagery, news and Earthus analysis are context; they are not permission or navigation instructions.

## 7. Current implementation state

Implemented in the Earthus 2.0 preview runtime:

- Route Intelligence runtime and route registry
- NSR / NWP / transpolar geometry gates
- Arctic route UI injected into the v2 OCEAN feature rail
- direct NASA GIBS sea-ice visual adapter
- direct NASA GIBS optical/VIIRS visual adapter
- Resource Task loading/retry/cancel integration
- source/product/time-mode/provenance dispatch
- Arctic camera focus
- NSIDC / Copernicus / Sentinel-1 source registry and readiness states

Not yet complete:

- authoritative reusable NSR dynamic corridor geometry
- authoritative reusable NWP multi-corridor geometry
- Copernicus Marine server adapter
- Sentinel-1 SAR processing adapter
- route-specific weather/ocean/hazard matching
- route-related news matcher wiring in the v2 runtime
- historical comparison UI/data cache
- browser/PWA and real-device validation

## 8. Next integration order

1. validate NASA GIBS browser/CORS/tile behavior in the v2 preview
2. implement exact latest-time metadata resolution for every active GIBS visual layer
3. connect authoritative route/corridor geometry source(s)
4. connect route-specific Earthus weather/ocean/hazard adapters
5. connect existing GDELT/regional-news/news-brief pipelines to route corridor relevance
6. implement NSIDC history/season compare server cache
7. add Copernicus Marine advanced sea-ice adapter
8. add Sentinel-1 SAR adapter
9. browser/PWA performance QA
10. real-device test only after the global P0 handoff gate
