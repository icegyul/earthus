# V38 SOURCE INTEGRATION HANDOFF

Apply the V38 target rules to the real EARTHUS application source.

Required production build matrix:

| Product | WEB | MOBILE | PLEOS |
|---|---:|---:|---:|
| EARTHUS | YES | YES | YES |
| AETHERUS | YES | YES | NO |

Pleos must import the EARTHUS-only renderer and must not import AETHERUS renderer modules.

Production integration checklist:
- register `/earthus` routes for Pleos
- exclude `/aetherus` and `/space` routes from Pleos
- exclude `aetherus/` and `space/` bundle namespaces
- exclude `aetherus.*` and `space.*` analytics
- keep AETHERUS enabled for Web/Mobile builds
- connect real repository/provider adapters
- connect real map renderer
- connect real Pleos CarUxRestrictions/DrivingState source
- run V38 gate before creating the final APK/AAB
