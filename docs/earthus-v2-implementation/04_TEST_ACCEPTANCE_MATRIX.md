# Test / Acceptance Matrix

| Gate | Required evidence |
|---|---|
| Viewer singleton | `globalThis.__earthusViewer` points to the only viewer; new Viewer construction absent in v2 code |
| Quiet Earth | no v2 primary/secondary feature after EARTH selection |
| Menu exclusivity | at most one PRIMARY domain and one approved SECONDARY context |
| Async safety | stale generation cannot commit after a newer scene transition |
| Layer ownership | v2 turns off only layers it owns; unrelated official safety state is preserved |
| Feature OFF | existing layer-specific fetch/timer/worker/primitive/imagery disposal path is observed |
| 50-cycle stress | no v2-owned layer left on after final EARTH, no uncaught console error |
| Truth | actual observation/forecast/model/simulation labels remain distinct |
| Performance | browser FPS/thermal evidence collected on target devices later; no fabricated PASS |
| Deployment | actual `/v2` HTTP/headers/browser evidence required; local file existence is not deployment |
