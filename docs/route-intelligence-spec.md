# EARTHUS 2.0 — Route Intelligence Specification

## Status

- Product area: OCEAN / ROUTES
- Implementation phase: post-P0 extension. The current pre-device P0 sequence remains unchanged.
- Target branch: `earthus-v2/actual-first-screen-preview`
- Purpose: connect global routes to Earthus weather, ocean, satellite, hazard and news data without presenting navigational instructions.

## 1. Top-level route classes

### ARCTIC ROUTES

Examples:
- Northern Sea Route (NSR)
- Northwest Passage (NWP)
- Transpolar / future polar corridors where an authoritative reference geometry is available

Primary context:
- sea-ice concentration and edge
- optical satellite imagery
- SAR/ice imagery when a reusable source is legally and technically available
- sea-surface temperature
- wind / waves
- weather and tropical/extratropical hazards
- research/port/chokepoint context
- historical and seasonal comparison

### TRADE ROUTES

Examples:
- Suez route
- Panama route
- Malacca / Singapore corridor
- Cape of Good Hope alternatives
- major Pacific / Atlantic / Indian Ocean trade corridors

Primary context:
- route and chokepoints
- ports
- weather / waves / wind / current
- tropical cyclone and other hazards
- verified congestion/closure/incident signals when a source exists
- relevant regional news
- alternative-route comparison only as information, not as navigational direction

### RESEARCH ROUTES

Examples:
- polar research vessel expeditions
- oceanographic campaigns
- climate / sea-ice / marine-life expeditions

Primary context:
- published expedition route/mission geometry
- vessel/mission metadata where publication rights allow
- observation stations / sampling areas
- related satellite and environmental observations
- published research/mission updates
- relevant local and institutional news

## 2. Common Route Intelligence contract

A route should be represented as a stable entity rather than a decorative polyline.

Minimum fields:

- `routeId`
- `routeClass`: `ARCTIC`, `TRADE`, `RESEARCH`
- canonical route name and localized name
- source and geometry version/effective date
- route geometry or corridor geometry
- segment list
- countries / EEZ or coastal regions touched only when sourced/derived transparently
- ports / chokepoints associated with the route
- bounding corridor used for contextual data queries
- provenance
- updated time

Each segment may expose Earthus context modules:

- `WEATHER`
- `OCEAN`
- `SEA_ICE`
- `SATELLITE`
- `HAZARD`
- `PORT_CHOKEPOINT`
- `NEWS`
- `HISTORY`

## 3. Route-related News

### Product rule

Every route detail screen may show a `RELATED NEWS` section made from stories relevant to the route corridor, countries, ports, chokepoints and current route conditions.

This is not a generic country-news feed. A story must have a defensible relationship to the selected route.

### Existing Earthus assets to reuse

- `aws/gdelt-events/handler.py`
  - geocoded global events
  - source/mention-based confidence scoring
  - deduplication and confirmed/unconfirmed distinction
- `aws/regional-news/handler.py`
  - regional outlet headlines and links
  - preserves original-language title
  - title/link/time/source only for copyright safety
- `aws/news-brief/handler.py`
  - factual AI briefs for confirmed events
  - each factual item requires source URLs
  - no unsupported speculation

Do not build an independent route-news crawler unless these existing pipelines prove insufficient.

## 4. Route News relevance model

### Geographic relevance

A story/event can qualify when at least one of these is true:

1. geocoded point falls within the route corridor/buffer;
2. geocoded point is near a route port/chokepoint;
3. story is tied to a country/region traversed by the selected route and contains route-relevant subject evidence;
4. institutional research news is explicitly associated with the selected research mission/ship/expedition.

Do not classify every story from a traversed country as route-related.

### Subject relevance

Priority subjects include:

- port closure / reopening
- canal or strait disruption
- vessel incident affecting traffic
- maritime security event
- strike / labor action affecting a route port
- severe weather
- tropical cyclone
- sea-ice or polar navigation conditions
- wildfire/smoke only when materially relevant to a port/route operation
- sanctions/regulatory measures directly affecting shipping on the selected corridor
- infrastructure failure affecting ports/canals
- research expedition update for research routes
- sea-ice / ocean / climate findings directly associated with an Arctic or research route

Generic politics, entertainment and unrelated national news must be excluded.

## 5. Relevance scoring

The first implementation should be transparent and rule-based. Do not invent a hidden AI score.

Suggested evidence dimensions:

- distance to route corridor
- distance to named route node/chokepoint/port
- explicit route/port/strait/canal/ship/mission name match
- maritime subject/category match
- freshness
- existing Earthus event confidence (`confirmed` preferred)
- number of independent sources when available

Output should expose why the article is present, for example:

- `Near route: 42 km`
- `Related node: Suez Canal`
- `Topic: Port disruption`
- `Confirmed event · 5 sources`

If relevance evidence is weak, omit the item rather than forcing a feed.

## 6. UI

Route detail panel hierarchy:

1. ROUTE OVERVIEW
2. CURRENT CONDITIONS
3. RISK / HAZARD CONTEXT
4. SATELLITE / SEA ICE where applicable
5. RELATED NEWS
6. HISTORY / COMPARE

### RELATED NEWS card

Minimum display:

- headline
- source/outlet
- published/observed time
- related route segment/node
- relevance reason
- original article link
- Earthus confirmation status where the item comes through the GDELT event pipeline

If an Earthus `news-brief` exists for a confirmed event, the route panel may expose that brief with its source links. Otherwise show the headline/link metadata only.

### Map interaction

When a route-related event has reliable coordinates:

- optionally mark the event on/near the route
- selecting the marker opens the related-news card
- selecting a news card may focus the map on the sourced event position

A headline without reliable coordinates must not be assigned an invented map location.

## 7. Arctic-specific news

For Arctic routes, prioritize:

- sea-ice extent/concentration changes
- icebreaker operations when publicly sourced
- temporary navigation restrictions
- polar port conditions
- research/observation updates
- severe weather
- official route-season announcements
- policy/regulatory changes directly affecting the route

The presence of a news story must never be converted into an Earthus claim that a route is `open`, `closed`, `safe`, or `navigable` unless an authoritative operational source explicitly establishes that state.

## 8. Trade-route news

For trade routes, prioritize:

- canal/strait/port interruptions
- closure/reopening notices
- queue/congestion data when an authoritative source exists
- maritime incidents affecting traffic
- major weather/hazard events along the route
- route-specific sanctions/regulation changes

Earthus may visualize a verified disruption and show alternative geographic corridors for comparison, but must not tell a vessel which route to navigate.

## 9. Research-route news

For research routes, prioritize:

- mission departure/arrival
- expedition progress
- research institute announcements
- published observation campaigns
- scientific findings linked to the mission/route
- sea-ice / ocean / atmosphere observations around the mission corridor

Research updates should preserve the distinction between `MISSION UPDATE`, `OBSERVATION`, `PUBLISHED RESEARCH`, and ordinary `NEWS`.

## 10. Copyright / provenance

- Preserve the current regional-news rule: headline, link, publication time and source only unless an approved Earthus brief exists.
- Do not copy article bodies into Earthus.
- AI-generated briefs must retain source links and be visibly identified as an Earthus/AI brief.
- Do not invent geographic locations, route relevance, publication times or source identity.
- Store the route-news match reason/provenance so the UI can explain why an item appears.

## 11. Future engine name

`EARTHUS ROUTE INTELLIGENCE ENGINE`

Submodules:

- Route Geometry
- Route Context
- Arctic / Sea-Ice Context
- Trade Chokepoint Context
- Research Mission Context
- Route News Matcher
- Route History

## 12. Implementation order

This feature must not interrupt the active pre-device P0 sequence.

After the P0 handoff gate:

1. route canonical schema and source registry
2. static/reference route geometry
3. route segment/chokepoint model
4. Earthus weather/ocean/hazard context adapters
5. Route News Matcher using existing GDELT/regional-news/news-brief outputs
6. Arctic sea-ice/satellite adapters
7. trade-route operational context
8. research-route mission context
9. history/timeline comparison
10. browser/device performance validation

## 13. Definition of done for Route News

Route news is complete when:

- route-related stories are filtered by both geography and subject relevance;
- unrelated national news does not flood the route panel;
- every displayed item has source, time and relevance reason;
- confirmed/unconfirmed Earthus event states remain visible where applicable;
- no article body is copied into the product;
- map markers use sourced coordinates only;
- route-news matching failures never change a route safety/navigation state;
- the implementation reuses the existing Earthus news pipelines rather than duplicating them without evidence.
