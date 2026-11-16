# Token Launch Radar — make.fun bounty token-radar-01

A radar for token launches that have not happened yet. It reads the bounty's
sealed DefiLlama snapshot and ranks **every protocol that records no token —
all 342 of them**, the house watchlist's 40 included in full — by the implied
value of the token it may one day issue, each with a costed five-step farm
plan and a verdict. The traded protocols are never ranked: they are the
comparables the model is fitted on, shown separately at the market's own
values.

**The model, tested blind:** a comps curve fitted on the snapshot's own 87
traded protocols at the board's scale,

```
log10(mcap) = 3.2329 + 0.3773 · log10(TVL) + 0.4173 · log10(1 + age_days)
```

fitted by least absolute deviations and validated by 25 repeats of 5-fold
cross-validation, scored on held-out folds only: **median out-of-sample error
×2.23** (41% within 2×, 77% within 5×). Every row's band is its value ÷/×2.23.
The full method, the rejected specs (a 7-day growth term made the blind error
worse, ×2.43, and was left out on the evidence), the farm-plan cost model and
the honest comparison against the live field are in [MODEL.md](MODEL.md).

## Run it

Node 22, standard library only, no install:

```
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

`--input` takes the snapshot file or its directory; in this repository,
`data/snapshot.json` is a byte copy of the kit's sealed input, so
`node main.ts --input data` reproduces the run. The program writes to the
output directory:

| File | What it is |
| --- | --- |
| `board.json` | The ranked board: 342 rows, ranks 1..N, implied value + ÷/×2.23 band, flags, verdict, farm steps |
| `data.js` | The dashboard's dataset, generated from the same board |
| `dashboard/` | The dashboard (board, filters, sort, per-protocol detail view, live set, method) |
| `screenshots/` | Board, detail and filtered views of the dashboard |
| `dossier.json` | The judge's summary, written by `buildDossier` from `vendor/makefun-board.ts` |

The program refuses to hand in a board that misses a watchlist slug, misses a
pre-token protocol, breaks rank order, or carries a farm step outside the
gate's limits (`boardIssue` in `lib/model.ts`).

## Layout

- `main.ts` — the entry program: snapshot in, board + dashboard data +
  dossier out.
- `lib/model.ts` — the model: snapshot parsing, the LAD comps fit, implied
  values and bands, product flags, farm plans and verdicts, board checks.
- `dashboard/` — `index.html`, `app.css`, `app.js`: a static page, no network,
  ~22 KB of source so the dossier shows every file whole.
- `vendor/makefun-board.ts` — make.fun's dossier library, vendored unchanged.
- `data/snapshot.json` — the sealed snapshot this entry reads.
- `screenshots/` — the three dossier images, rendered from the built page.

## The honest comparison

| | v1 (superseded) | v2 (this entry) | Live #10 | Live #1 (962,052) |
|---|---|---|---|---|
| Data | Live DefiLlama fetch | Sealed kit snapshot | Sealed snapshot | Sealed snapshot |
| Rows | 198 | **342 (every pre-token protocol)** | 198 | Every pre-token protocol |
| Watchlist | 34/40 | **40/40** | 40/40 | 40/40 |
| Blind / OOS error | ×2.61 | **×2.23** (25× 5-fold CV, stated method) | ×2.01 (self-reported, "93 families") | "Tested blind" — no figure published |
| Dossier | Provisional guess | Kit `buildDossier`, byte-exact | Kit format | Kit format |

v2 closes every measurable gap v1 had — coverage, watchlist, sourcing,
dossier — and improves the honest blind error from ×2.61 to ×2.23. It does
**not** reach the #10 entry's self-reported ×2.01 on the sealed comps under a
stated metric, and it cannot be scored against #1's curve at all, because #1
publishes no number. Those two facts are stated, not smoothed over: see
MODEL.md, "Against the live field's published numbers".

## License

MIT — see `LICENSE`.
