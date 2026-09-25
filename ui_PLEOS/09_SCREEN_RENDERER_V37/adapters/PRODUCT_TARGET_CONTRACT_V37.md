# EARTHUS V37 Product / Platform Target Contract

## Non-negotiable product separation

### EARTHUS
EARTHUS is the product rendered in Pleos, mobile apps, foldable layouts, and web.
Pleos uses the EARTHUS product shell only.

### AETHERUS
AETHERUS is a separate space product.
AETHERUS is available in:
- Mobile App
- Web Service

AETHERUS is **NOT available in Pleos**.

This means AETHERUS must not appear in any Pleos surface, including:
- app name / logo / title
- navigation / dock / panel
- search results
- deep links
- settings
- account switchers
- analytics event names
- bundled AETHERUS data
- space-control UI
- orbit / launch / debris features

## Hard build-time rule

`product=AETHERUS + platform=PLEOS` is an invalid target and must fail closed.
It must be rejected before route/renderer registration.

## Allowed matrix

| Product | Web | Mobile | Pleos |
|---|---:|---:|---:|
| EARTHUS | YES | YES | YES |
| AETHERUS | YES | YES | **NO** |

## EARTHUS Pleos scope

Pleos navigation is EARTHUS-only:
Earth / Weather / Satellite / Ocean / Atmosphere / Disaster / Local.

The EARTHUS `Satellite` menu is Earth-observation / weather satellite functionality only. It is not the AETHERUS spacecraft / orbit / launch / debris product.
