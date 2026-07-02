# Restore point: before family layer-first rules (PRO / CONDI / Moulages / AERO / spare)

Created after horizontal partial-layer fix for LINEO (75mm); before extending the same rule to LINEO PRO, LINEO PRO CONDI, Moulages, AERO PRO, and spare parts.

Git commit: `7009879` — *Extend layer-first horizontal packing to PRO, CONDI, Moulages, AERO, and spare parts.*

## Restore (revert to pre-family-layer state)

```
git checkout 7009879^ -- lib/packing/ergovent-engine.ts .cursor/rules/packing-no-overlap.mdc
```

Or copy files from this folder back to their live paths:

- `ergovent-engine.ts` → `lib/packing/ergovent-engine.ts`
- `packing-no-overlap.mdc` → `.cursor/rules/packing-no-overlap.mdc`
