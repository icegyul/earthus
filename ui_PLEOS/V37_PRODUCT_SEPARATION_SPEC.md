# V37 Product Separation Specification

## One sentence requirement
**EARTHUS is the Pleos product; AETHERUS is a separate mobile/web product and must never appear in Pleos.**

## Runtime policy
1. Pleos bootstrap may instantiate only `EARTHUS + PLEOS`.
2. AETHERUS routes are not registered in Pleos.
3. AETHERUS assets/data namespace is not bundled into the Pleos package.
4. AETHERUS analytics events are not emitted from Pleos.
5. AETHERUS deep links are rejected when platform is Pleos.
6. AETHERUS search index entries are excluded from Pleos search.
7. AETHERUS account/product switcher is excluded from Pleos.
8. Mobile/Web may instantiate AETHERUS independently.

## Acceptance criteria
- Build guard rejects AETHERUS/Pleos.
- Pleos HTML contains no visible AETHERUS brand.
- Pleos model reports `product=EARTHUS`.
- Mobile AETHERUS renderer can be instantiated.
- Web AETHERUS renderer can be instantiated.
