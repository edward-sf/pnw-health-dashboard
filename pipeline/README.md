# pnw-health pipeline

Fetches, harmonizes, validates, and exports county public health data for the PNW dashboard. See the repo root README and `docs/superpowers/` for design and plans.

## Modeling prerequisites

The ML stage uses LightGBM, which needs the OpenMP runtime. On macOS install it once with `brew install libomp`.
