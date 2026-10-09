# IKEA 3D Assembly Guide (MVP)

Interactive 3D step player for IKEA LACK furniture: side table, coffee table and TV bench.

```
npm install
npm run dev      # http://localhost:5173
npm test         # pose engine, all products, FAQ, voice parser
npm run build
```

- Products: pick one with the selector under the product name, or use `?product=lack|lack-coffee|lack-tv`. The registry is `src/data/products.ts`.
- Step data: `src/data/<product>.json`. `node scripts/gen-lack.mjs` generates the side table. `node scripts/gen-lack-shelf.mjs` generates the coffee table and TV bench, following IKEA manuals AA-472482 and AA-837205. Tune poses in the scripts.
- Everything on screen is a pure function of (step, t): `src/engine/pose.ts`.
- Keys: ← → next/back, space play/pause, R replay, E explode.
- Voice (Chrome): "next", "back", "again", "done", "explode", "question …" or just ask "which screw…".
- Ask: `api/ask.ts` is a Vercel Function using AI Gateway. In `npm run dev` there is no function, so answers come from the offline per-step FAQ.
- Study mode: `?study=1&cond=app&pid=P01` shows a timer and an Export button for the JSON log. The export includes the product and a `baseline` of real-world step times.
- Real-world timing: `node scripts/asm-stats.mjs` downloads the IKEA ASM action annotations (~330 KB, into the gitignored `datasets/`). It writes `src/data/asm/<product>.json` with step times from about 95 recorded builds of each product. Then rerun the gen scripts to merge them into the steps as `typical` times and FAQ answers.

## Data credits

- IKEA ASM Dataset: Y. Ben-Shabat et al., "The IKEA ASM Dataset: Understanding People Assembling Furniture through Actions, Objects and Pose", WACV 2021. https://ikeaasm.github.io/. CC BY-NC 4.0, so non-commercial use only. Only derived statistics are included here.
- IKEA-Manual: R. Wang et al., "IKEA-Manual: Seeing Shape Assembly Step by Step", NeurIPS 2022 Datasets and Benchmarks. https://arxiv.org/abs/2302.01881. Used for the LACK coffee table shelf height.
- Assembly steps follow the official IKEA manuals for each product.
