# Advanced Intelligence Backend Architecture

## Boundary
Backend Foundation v1.0 answers **how data safely enters, persists, queries, recovers and releases**. This v1.0 Advanced Intelligence layer answers **how verified data becomes Earthus intelligence**.

```text
Providers -> Backend Foundation v1.0 -> Canonical Signals / Events
                                      -> Feature Store
                                      -> Evidence Graph
                                      -> Advanced Intelligence
                                          |- Earth Pulse
                                          |- Travel Discovery / Why Now / Best Window
                                          |- Pollution Lens / Modelled Transport
                                          |- Public Action / News Fusion
                                          |- Earth Memory
                                          |- Forecast Calibration
                                          `- FOR ME
                                      -> Release Gate (SHADOW -> CANARY -> ACTIVE)
                                      -> Internal API -> /v2
```

No route in this layer calls external providers directly. Browser-to-provider fan-out remains forbidden.
