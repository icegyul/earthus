# EARTHUS 2.0 — Transport Intelligence Product Decision

## Status

- Product areas: `OCEAN / ROUTES`, `FLIGHTS / AIRPORT INTELLIGENCE`
- Decision state: LOCKED product direction for the current Earthus 2.0 branch
- Related specification: `docs/route-intelligence-spec.md`
- Principle: do not fabricate unavailable real-time transport data in order to make a screen look complete.

---

## 1. Maritime product decision

### Replace `Vessels` as the primary Earthus feature

Earthus must not present a primary menu that implies Earthus itself has continuous global commercial-vessel tracking when that capability and redistribution right are not established.

Primary product surface:

`VESSELS` → `ROUTES / 항로`

Primary engine:

`EARTHUS ROUTE INTELLIGENCE ENGINE`

Earthus should explain what is happening **around a route**, rather than trying to imitate a commercial AIS vessel-position service.

### Route classes

1. `ARCTIC` — flagship
2. `TRADE`
3. `RESEARCH`

Commercial vessel-position services may remain as clearly separated `REFERENCE` links when useful. They are not the main Earthus product and must not be described as Earthus-owned live tracking.

---

## 2. Arctic Routes are the flagship Route Intelligence surface

Arctic Routes are the first-priority and most distinctive route experience in Earthus.

Initial route families:

- Northern Sea Route (`NSR`)
- Northwest Passage (`NWP`)
- transpolar/future polar corridors only when authoritative reference geometry is available

The product goal is to let a user inspect an Arctic corridor directly on the Earthus 3D globe and understand the surrounding conditions through a synchronized time context.

### Arctic Route Intelligence stack

- authoritative/reference route geometry and version
- sea-ice concentration and ice edge
- optical satellite imagery
- SAR/ice imagery when a legally reusable source is available
- weather
- wind and gusts
- waves and swell
- sea-surface temperature / anomaly where relevant
- polar hazards and official restrictions
- ports, chokepoints and research context
- route-related verified news
- historical / seasonal comparison
- source, observed/valid time and update state for every layer

### Product positioning rule

Arctic Routes should be treated as a flagship Earthus differentiator, but Earthus must not advertise itself as the world's only service with this capability unless that exclusivity has been independently verified at the time of the claim.

The defensible differentiation is the **Earthus combination**: 3D globe + route corridor + sea ice + satellite + weather/ocean + hazards + related news + history in one coherent route experience.

### Hard safety gate

Earthus must not convert model data, imagery, news, or inferred conditions into unsupported operational claims such as:

- `OPEN`
- `CLOSED`
- `SAFE`
- `NAVIGABLE`
- recommended vessel routing

Those states require an authoritative operational source that explicitly supports the claim.

---

## 3. Trade Route Intelligence

Target examples:

- Suez
- Panama
- Malacca / Singapore
- Cape of Good Hope alternatives
- major Pacific / Atlantic / Indian Ocean corridors

Primary context:

- route corridor
- chokepoints
- ports
- weather / wind / waves / ocean context
- tropical cyclone and other hazards
- verified closure, congestion or incident signals when an authoritative source exists
- route-related news
- historical comparison

Alternative corridors may be shown for geographic/informational comparison, not as navigation advice.

---

## 4. Research Route Intelligence

Target examples:

- polar research expeditions
- oceanographic campaigns
- climate / sea-ice / marine-life missions

Use published route or mission geometry only when provenance and publication rights permit it.

Show:

- mission route / expedition track
- observation or sampling points
- mission metadata
- satellite / ocean / climate context
- published mission updates
- related institutional and local news

Do not present a published historical/mission track as a live vessel position unless it is actually a sourced live feed with compatible rights.

---

## 5. Flight product decision

The Earthus flight surface should be organized around the traveler's journey, not around aircraft tracking alone.

Primary flow:

1. search origin and destination airports
2. show expected route / distance context
3. show `AIRPORT INTELLIGENCE`
4. continue to external booking
5. retain actual ADS-B aircraft tracking as a secondary post-boarding feature where available

The existing aircraft tracker is useful and should remain, but it is not the sole value of the flight menu.

---

## 6. Airport Intelligence

Airport Intelligence follows the actual itinerary:

`DEPARTURE → TRANSFER(S) → ARRIVAL`

### Never infer a transfer airport

If Earthus only has origin and destination, show only those two airports.

A transfer airport may be inserted only when actual itinerary / flight-segment data identifies it.

For multiple transfers, preserve segment order and apply the same intelligence contract to every confirmed airport.

### Core information for each airport

#### A. Time and weather

- exact local time using a trustworthy timezone mapping
- weather around the relevant departure / transfer / arrival time window
- temperature / feels-like where useful
- precipitation
- wind and gusts
- visibility
- fog
- rain / snow / thunderstorm conditions
- official weather warnings

#### B. Hazard context

Only when geographically/materially relevant:

- tropical cyclone
- severe storm
- heavy snow
- wildfire / smoke
- earthquake
- flooding
- other verified disaster/safety events affecting the airport or access corridor

#### C. Airport and ground access

When a trustworthy source exists:

- airport rail
- public transport disruption
- road/access disruption
- strike / labor action
- airport operational notices

#### D. Flight operations — hard source gate

Do not invent or estimate these fields from generic weather/news data:

- delay
- cancellation
- gate
- terminal
- runway state
- airport closure

Display them only when a trustworthy operational provider explicitly supplies the field and update time.

#### E. Related news

Prefer relevant news about:

- airport operations
- transport disruption
- strike action
- severe weather affecting the airport
- disaster/safety events affecting the airport or access route

Every item keeps source and publication time. Do not turn a headline into an operational state unless an authoritative source confirms it.

---

## 7. UX hierarchy

### Flights

1. `WHERE FROM / TO`
2. `EXPECTED ROUTE`
3. `AIRPORT INTELLIGENCE`
   - departure
   - confirmed transfer airports, if any
   - arrival
4. `BOOKING`
5. `TRACK MY AIRCRAFT` — secondary

### Ocean / Routes

1. `ARCTIC ROUTES` — flagship
2. `TRADE ROUTES`
3. `RESEARCH ROUTES`
4. `OFFICIAL VESSEL REFERENCES` — secondary/reference only

---

## 8. Data truth rules

Across maritime and aviation transport screens:

- source identity must be preserved
- observed / issued / valid / updated time must be preserved
- model output must remain distinguishable from observation and official operational state
- missing data is shown as unavailable, not filled with invented values
- news is context, not a substitute for an operational feed
- geographic inference must not become an unsupported safety conclusion
- historical tracks must not be labeled live
- Earthus analysis must remain distinguishable from authoritative notices

---

## 9. Implementation priority

### P1 — now

- replace `Vessels` primary UI with `Routes`
- expose Arctic / Trade / Research Route Intelligence structure
- keep official vessel services as secondary reference links
- add Airport Intelligence structure between expected route and booking
- preserve existing ADS-B tracking as a secondary flight feature
- enforce transfer-airport and operational-data hard gates

### P2 — data adapters

- trustworthy airport timezone mapping
- airport weather-window adapter
- official warnings and Earthus hazard-context adapter
- airport-related news matcher
- itinerary / segment provider for confirmed transfer airports
- trustworthy flight operational feeds where commercially/legal feasible

### P3 — flagship Arctic implementation

- canonical NSR / NWP route geometries
- sea-ice timeline
- satellite/ice imagery adapters
- route corridor condition aggregation
- route-related news and official-notice matching
- seasonal / historical comparison
- 3D globe interaction and performance validation

---

## 10. Definition of done

This transport direction is implemented correctly when:

- the primary maritime menu no longer promises Earthus-owned global live vessel tracking;
- users enter a Route Intelligence experience instead;
- Arctic Routes are visibly the flagship route class;
- official vessel-position services are clearly separated as references;
- flight planning shows Airport Intelligence before booking;
- departure and arrival are always explicit;
- transfer airports appear only from confirmed itinerary segments;
- operational flight fields are shown only from trustworthy operational feeds;
- existing ADS-B aircraft tracking remains available as a secondary feature;
- no unavailable transport state is fabricated to complete the UI.
