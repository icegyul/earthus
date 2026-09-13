# Interaction Asset Status — V3 WONDER 1.8

## Included
- 124-character interaction manifest
- wave / point / fart / special reaction definitions
- lightweight SVG FX
- 24 background WebP assets under `assets/background/`
- background catalog with byte size and hash
- runtime resolver

## Important production distinction
The current 124 runtime images originate from approved full-body PNG/WebP character art. A single flattened character image cannot reliably provide true independent arm/hand deformation.

Therefore:
- wave/point are currently runtime action contracts + FX/sprite fallback
- fart is a playful FX reaction for selected characters
- each character has an individual `special` action derived from its existing move set
- final high-fidelity hand/arm motion requires semantic parts supplied by the art pipeline

Do not claim that all 124 characters have final semantic limb animation until those parts are actually produced and browser-verified.
