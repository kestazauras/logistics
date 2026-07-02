# Backup: before LINEO-500 brickwise packing

Created before implementing LINEO-500 bricklaying (10 pcs/layer, brickwise alternate layers).

## Restore

Copy these files back over the live versions:

- `ergovent-engine.ts` → `lib/packing/ergovent-engine.ts`
- `overhang.ts` → `lib/overhang.ts`

Or revert git commit after this backup:

```
git log --oneline -3
git checkout 69dc91c -- lib/packing/ergovent-engine.ts lib/overhang.ts
```

Git commit: `69dc91c` — "Backup before LINEO-500 brickwise layer packing (10 pcs/layer)."
