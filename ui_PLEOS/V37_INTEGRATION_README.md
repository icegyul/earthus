# EARTHUS V37 — Actual Screen Renderer + Product Separation

## 1. Goal
V37 connects the V36 UI adapter to a screen renderer and locks product boundaries at target/build time.

## 2. Absolute product rule

**AETHERUS does NOT enter Pleos.**

AETHERUS is a separate product delivered through:
- Mobile App
- Web Service

AETHERUS is **not a Pleos product**, and the Pleos build must reject `AETHERUS + PLEOS` before renderer or route registration.

### Product matrix
| Product | Web | Mobile | Pleos |
|---|---:|---:|---:|
| EARTHUS | YES | YES | YES |
| AETHERUS | YES | YES | NO |

## 3. Pleos renderer
Pleos is an EARTHUS-only surface.

Visible navigation:
- Earth
- Weather
- Satellite
- Ocean
- Atmosphere / Air
- Disaster
- Local

`Satellite` in Pleos means Earth-observation/weather-satellite layers, not AETHERUS's spacecraft/orbit/launch/debris product.

## 4. Layouts
- WEB: web layout
- PHONE: mobile portrait
- WIDE/FOLD: wide layout
- PLEOS: Pleos EARTHUS-only wide layout

## 5. Renderer responsibilities
The renderer owns screen composition only. Domain rules and safety remain in V33-V36.

```text
PRODUCT TARGET
      ↓
V36 UI Adapter
      ↓
V37 Screen Renderer
      ↓
Dock / Panel / Map / Place Card
      ↓
V33 SafetyGate on action execution
```

## 6. Fail-closed behavior
- `AETHERUS + PLEOS` => rejected
- unknown/unregistered product target => rejected
- Pleos does not register AETHERUS routes, navigation, analytics, or bundle namespaces

## 7. AETHERUS mobile/web
AETHERUS has its own renderer target for Mobile and Web. It is not exposed through the Pleos EARTHUS navigation.
