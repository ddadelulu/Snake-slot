"""Build a self-contained, shareable demo of the game (play money, no server). Not part of the submission.

Copies the upload-ready build, inlines scripts/demo_rgs.js (an in-page stand-in for the RGS) ahead of the game's
boot script, and writes books/<mode>.json from the LUT-weighted sample in dev/books (math/extract_books.py).
The Stake upload is always build/ itself, never this folder.

  python3 scripts/make_demo.py <outDir> [--feature-books 150]
"""

from __future__ import annotations

import argparse
import json
import os
import random
import shutil

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.normpath(os.path.join(HERE, ".."))
BUILD = os.path.join(APP, "build")
BOOKS = os.path.join(APP, "dev", "books")
MATH_CFG = os.path.join(APP, "src", "game", "generated", "mathConfig.json")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--feature-books", type=int, default=150, help="books kept per bonus-buy mode (they are large)")
    a = ap.parse_args()
    if os.path.exists(a.out):
        shutil.rmtree(a.out)
    # the JS and CSS are inlined in index.html, so _app/ is not needed (and "_" paths are reserved by the host)
    shutil.copytree(BUILD, a.out, ignore=lambda d, names: ["_app"] if os.path.samefile(d, BUILD) else [])

    costs = {m["id"]: m["cost"] for m in json.load(open(MATH_CFG, encoding="UTF-8"))["modes"]}
    index = json.load(open(os.path.join(BOOKS, "showcase.json"), encoding="UTF-8"))
    rng = random.Random(12)
    os.makedirs(os.path.join(a.out, "books"))
    for mode in costs:
        sample = index[mode]["sample"]
        if costs[mode] > 10 and len(sample) > a.feature_books:
            sample = rng.sample(sample, a.feature_books)
        keep = set(sample)
        with open(os.path.join(BOOKS, f"{mode}.jsonl"), encoding="UTF-8") as f:
            books = [b for b in map(json.loads, f) if b["id"] in keep]
        with open(os.path.join(a.out, "books", f"{mode}.json"), "w", encoding="UTF-8") as f:
            json.dump(books, f, separators=(",", ":"))

    shim = open(os.path.join(HERE, "demo_rgs.js"), encoding="UTF-8").read().replace("__COSTS__", json.dumps(costs))
    page = open(os.path.join(BUILD, "index.html"), encoding="UTF-8").read()
    # the artifact host wraps the page in its own document, so drop the outer tags and keep head + body content
    for tag in ("<!doctype html>", '<html lang="en">', "<head>", "</head>", "<body>", "</body>", "</html>"):
        page = page.replace(tag, "", 1)
    head_end = page.index("</title>") + len("</title>")
    page = page[:head_end] + "\n<script>\n" + shim + "</script>\n" + page[head_end:]
    with open(os.path.join(a.out, "index.html"), "w", encoding="UTF-8") as f:
        f.write(page)
    files = sorted(os.path.relpath(os.path.join(d, n), a.out) for d, _, ns in os.walk(a.out) for n in ns)
    size = sum(os.path.getsize(os.path.join(a.out, p)) for p in files)
    print(f"demo: {len(files)} files, {size / 1e6:.1f} MB -> {a.out}")


if __name__ == "__main__":
    main()
