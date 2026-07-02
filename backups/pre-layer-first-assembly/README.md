# Restore point: before unified layer-first assembly

Created before fixing cross-SKU layer order (full layers before partials) and default 12 cm overhang.

Git commit: `3cb3909` — *Fix layer-first assembly order and set default overhang to 12 cm.*

## Restore (revert this change set)

```
git checkout 3cb3909^ -- lib/packing/ergovent-engine.ts lib/packing/layer-first-assembly.ts lib/calculations.ts components/OptimizerApp.tsx .cursor/rules/packing-no-overlap.mdc
```

Or copy files from this folder back to their live paths.
