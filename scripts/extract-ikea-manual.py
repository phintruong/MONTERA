"""Extract IKEA-Manual (102 objects) into compact JSON for scripts/import-ikea-manual.mjs.

Input:  datasets/ikea-manual/parquet/all-*.parquet, downloaded from
        https://huggingface.co/datasets/AssemblyWorld/ikea-manual (a conversion of
        Wang et al., "IKEA-Manual", NeurIPS 2022; annotations CC BY-NC-SA 4.0).
Output: datasets/ikea-manual/objects/<category>-<name>.json, one per object, with
        simplified meshes (vertex clustering, about 12k triangles per object) and the
        manual's step plan. Manual page images are dropped.

    pip install pyarrow numpy
    python scripts/extract-ikea-manual.py
"""

import json
import pathlib

import numpy as np
import pyarrow.parquet as pq

ROOT = pathlib.Path(__file__).resolve().parent.parent / "datasets" / "ikea-manual"
OUT = ROOT / "objects"
TRI_BUDGET = 12_000  # per object
COLUMNS = ["object_id", "category", "name", "parts", "steps", "assembly_tree", "geometric_equivalence_relation"]


def triangulate(faces):
    tris = []
    for f in faces:
        for k in range(1, len(f) - 1):  # fan; source faces are convex
            tris.append((f[0], f[k], f[k + 1]))
    return np.asarray(tris, dtype=np.int64).reshape(-1, 3)


def cluster(v, t, cell):
    """Vertex-clustering simplification: merge vertices in the same grid cell."""
    if cell <= 0:
        return v, t
    keys = np.floor((v - v.min(0)) / cell).astype(np.int64)
    _, inverse = np.unique(keys, axis=0, return_inverse=True)
    inverse = inverse.reshape(-1)
    count = inverse.max() + 1
    sums = np.zeros((count, 3))
    np.add.at(sums, inverse, v)
    merged = sums / np.bincount(inverse, minlength=count)[:, None]
    t2 = inverse[t]
    keep = (t2[:, 0] != t2[:, 1]) & (t2[:, 1] != t2[:, 2]) & (t2[:, 0] != t2[:, 2])
    return merged, t2[keep]


def simplify(v, t, cap, diag):
    cell = 0.0
    while len(t) > cap:
        cell = diag / 400 if cell == 0 else cell * 1.4
        v2, t2 = cluster(v, t, cell)
        if len(t2) <= cap or cell > diag / 10:
            return v2, t2
    return v, t


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    files = sorted((ROOT / "parquet").glob("all-*.parquet"))
    for path in files:
        for row in pq.read_table(path, columns=COLUMNS).to_pylist():
            parts = []
            for p in row["parts"]:
                v = np.asarray(p["vertices"], dtype=np.float64).reshape(-1, 3)
                t = triangulate(p["faces"])
                parts.append({"part_id": p["part_id"], "ann": p["annotation_part_id"], "v": v, "t": t})
            allv = np.concatenate([p["v"] for p in parts])
            diag = float(np.linalg.norm(allv.max(0) - allv.min(0)))
            total = sum(len(p["t"]) for p in parts)
            out_parts = []
            for p in parts:
                cap = max(150, int(TRI_BUDGET * len(p["t"]) / max(total, 1)))
                v, t = simplify(p["v"], p["t"], cap, diag)
                used = np.unique(t)  # drop unreferenced vertices
                remap = -np.ones(len(v), dtype=np.int64)
                remap[used] = np.arange(len(used))
                out_parts.append({
                    "id": p["part_id"],
                    "ann": p["ann"],
                    "v": np.round(v[used], 5).reshape(-1).tolist(),
                    "t": remap[t].reshape(-1).tolist(),
                })
            obj = {
                "id": row["object_id"],
                "category": row["category"],
                "name": row["name"],
                "parts": out_parts,
                "steps": [
                    {"step_id": s["step_id"], "page_id": s["page_id"], "parts": s["parts"], "connections": s["connections"]}
                    for s in row["steps"]
                ],
                "tree": json.loads(row["assembly_tree"]) if isinstance(row["assembly_tree"], str) else row["assembly_tree"],
                "equiv": json.loads(row["geometric_equivalence_relation"])
                if isinstance(row["geometric_equivalence_relation"], str)
                else row["geometric_equivalence_relation"],
            }
            slug = row["object_id"].replace("/", "-").lower()
            (OUT / f"{slug}.json").write_text(json.dumps(obj, separators=(",", ":")))
            tris = sum(len(p["t"]) // 3 for p in out_parts)
            print(f"{slug:28s} parts {len(out_parts):3d} steps {len(obj['steps']):3d} tris {total:7d} -> {tris:6d}")


if __name__ == "__main__":
    main()
