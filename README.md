# IKEA 3D Assembly Guide (MVP)

Interactive 3D step player for IKEA flat-pack furniture, built for a user study against the paper manual.

```
npm install
npm run dev      # http://localhost:5173
npm test         # pose engine, every product, FAQ, voice parser
npm run build
```

## Products (121)

Search by name in the header (accents don't matter: "poang" finds POÄNG), or open `?product=<id>`.

| Kind | Count | Where | How it's made |
| --- | --- | --- | --- |
| Full guides | 3 | `src/data/lack*.json`, bundled | LACK side table, coffee table, TV bench. `node scripts/gen-lack.mjs` and `node scripts/gen-lack-shelf.mjs`, following IKEA manuals AA-472482 and AA-837205. Hands-on detail: hardware, finished side, real step times. |
| Simplified | 17 | `public/products/fp-*.json` | KALLAX, BILLY, EKET and LINNMON/ADILS in several sizes. `node scripts/gen-flatpack.mjs` builds box models from IKEA's listed outside sizes with a generic build order. Fittings aren't shown. |
| Parts only | 101 | `public/products/im-*.json` | Real part meshes and the manual's step order from the IKEA-Manual dataset. Run `scripts/extract-ikea-manual.py` (needs pyarrow and numpy), optionally `node scripts/maw-timing.mjs`, then `node scripts/import-ikea-manual.mjs`. Approximate scale; each step names the paper manual page. Hidden behind "Show 101 more" until you search. |

Generated products are fetched on demand, one per page load. `src/data/products.ts` is the registry.

## Using it

- Phones: built for a phone propped up about 1 m away.
  - Step controls stay pinned at the bottom of the screen.
  - Swipe the panel left or right to change step; you feel a short buzz when the step changes.
  - The screen stays on while the guide is open.
  - Held sideways, the 3D view and panel sit side by side.
- Keys: ← → next/back, space play/pause, R replay, E spread parts out.
- 3D view: drag to turn, right-drag to move, scroll or pinch to zoom, double-click a part to turn around it. "Reset view" puts the camera back.
- Voice (Chrome): "next", "back", "again", "done", "explode", "question …" or just ask "which screw…".
- Ask: `api/ask.ts` is a Vercel Function using AI Gateway, for every product. Generated guides reach it through `vercel.json`'s `includeFiles`. In `npm run dev` there are no functions, so answers come from the offline per-step FAQ.

## User study

| Condition | Link | What it shows |
| --- | --- | --- |
| App | `?study=1&cond=app&pid=P01&product=lack` | The guide with a timer and an Export button. The product search is hidden, so a session can't switch products by accident. |
| Paper | `?study=1&cond=paper&pid=P02&product=lack` | An experimenter screen, with no 3D. Tap "Step N done" as the participant finishes each step, plus Stuck / Mistake / Asked when you see them. Export at the end. |

Both export the same JSON log, which includes a `baseline` of real-world step times. Put the exports in `study-logs/` (gitignored) and run:

```
node scripts/analyze-study.mjs study-logs/
```

It writes `study-results/sessions.csv` (total time and counts per session) and `study-results/steps.csv` (time per step against the real-world baseline), and prints medians per condition.

## Internals

- Everything on screen is a pure function of (step, t): `src/engine/pose.ts`.
- Real-world timing: `node scripts/asm-stats.mjs` downloads the IKEA ASM action annotations into the gitignored `datasets/` and writes `src/data/asm/<product>.json`. Rerun the gen scripts to merge them as `typical` step times and FAQ answers.

## Data credits

- IKEA ASM Dataset: Y. Ben-Shabat et al., WACV 2021. https://ikeaasm.github.io/. CC BY-NC 4.0, non-commercial only. Only derived statistics are included.
- IKEA-Manual: R. Wang et al., "IKEA-Manual: Seeing Shape Assembly Step by Step", NeurIPS 2022 Datasets and Benchmarks. https://cs.stanford.edu/~rcwang/projects/ikea_manual/. Annotations CC BY-NC-SA 4.0; part meshes and manuals belong to their creators. Used for the 101 parts-only guides and the LACK coffee table shelf height. Fine for this class project; don't use commercially.
- IKEA Manuals at Work: Y. Liu et al., NeurIPS 2024 Datasets and Benchmarks. https://github.com/yunongLiu1/IKEA-Manuals-at-Work. CC BY 4.0. Step times from assembly videos for 11 parts-only guides.
- Simplified guides use IKEA's published outside dimensions. Panel thicknesses and build order are estimates.
