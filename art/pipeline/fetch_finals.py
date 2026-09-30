"""Fetch the owner's final Higgsfield symbols into art/final/ and rebuild the game's asset manifest.

The sources are the links in the owner's "Constrictor Symbols" sheet (2026-09-30; 16 transparent 1024x1024 PNGs,
GPT Image 2.5). Each file is saved under the game filename it replaces, checked (PNG, square, has alpha), and then
art/pipeline/build_assets.py swaps it in for the placeholder. Files you already have locally (for example uploaded
by hand) can be installed instead with --from-dir DIR: they are matched by game filename or by Higgsfield filename.

Usage: math/env/bin/python art/pipeline/fetch_finals.py [--from-dir DIR] [--no-build]
"""

from __future__ import annotations

import argparse
import io
import os
import shutil
import subprocess
import sys
import urllib.request

from PIL import Image

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".."))
FINAL = os.path.join(ROOT, "art", "final")
BASE = "https://d8j0ntlcm91z4.cloudfront.net/user_3JrWTOoVF5tJ9w5nlZUUKBcA4rq/"
SOURCES = {
    "sym_H1.png": "hf_20260930_100142_c1ab88ea-4114-4e1b-83b2-b6385877ee01.png",
    "sym_H2.png": "hf_20260930_100141_05dc39dd-a07f-45aa-964d-84ce70d49d94.png",
    "sym_H3.png": "hf_20260930_100140_d06dee40-31af-4b57-9b30-1fcf9b8de69b.png",
    "sym_H4.png": "hf_20260930_100141_d62c512a-d2ac-4476-9813-a34bdb2665f6.png",
    "sym_L1.png": "hf_20260930_100140_bec22d32-5b7b-41ca-a43a-d22916127faf.png",
    "sym_L2.png": "hf_20260930_100140_cdd70728-b873-484a-a6b6-1562f79193c7.png",
    "sym_L3.png": "hf_20260930_100140_0f1c57c7-a53e-42d9-b924-9eb1cba0cc1c.png",
    "sym_L4.png": "hf_20260930_100140_c6313fca-20a3-48ff-811e-6fc01f0819ce.png",
    "sym_EGG.png": "hf_20260930_100140_d54bf223-5830-4c13-bbec-7a4dd6761315.png",
    "sym_KEY.png": "hf_20260930_100141_84a38dce-d650-4f08-ad27-e940d75a4a73.png",
    "pearl_white.png": "hf_20260930_100140_49ccd848-e6a8-4ca1-88c9-d15d639fceb2.png",
    "pearl_gold.png": "hf_20260930_100140_dee7f2f4-d46a-4e3d-86fc-a2a8d801eecf.png",
    "pearl_rose.png": "hf_20260930_100317_4847c459-9657-420a-ac61-9699e4200c85.png",
    "pearl_black.png": "hf_20260930_100317_8539034a-5595-404e-bad4-c0157a2f6873.png",
    "pearl_venom.png": "hf_20260930_100317_203a66a8-5797-4b3a-ac94-c3d400a003c2.png",
    "pearl_venom_grand.png": "hf_20260930_100317_7143fa74-36e7-48ce-93bd-c7d164bcf7b0.png",
}


def check(data: bytes, name: str) -> str | None:
    try:
        im = Image.open(io.BytesIO(data))
        im.load()
    except Exception as e:  # noqa: BLE001
        return f"{name}: not an image ({e})"
    if im.format != "PNG":
        return f"{name}: {im.format}, expected PNG"
    if abs(im.width - im.height) > 2:
        return f"{name}: {im.width}x{im.height}, expected square"
    if "A" not in im.getbands():
        return f"{name}: no transparency (the game needs a transparent background)"
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from-dir")
    ap.add_argument("--no-build", action="store_true")
    a = ap.parse_args()
    os.makedirs(FINAL, exist_ok=True)
    problems, done = [], 0
    for game_name, hf_name in SOURCES.items():
        data = None
        if a.from_dir:
            for cand in (game_name, hf_name):
                p = os.path.join(a.from_dir, cand)
                if os.path.exists(p):
                    data = open(p, "rb").read()
                    break
            if data is None:
                problems.append(f"{game_name}: not found in {a.from_dir} (as {game_name} or {hf_name})")
                continue
        else:
            try:
                with urllib.request.urlopen(BASE + hf_name, timeout=30) as r:
                    data = r.read()
            except Exception as e:  # noqa: BLE001
                problems.append(f"{game_name}: download failed ({e})")
                continue
        err = check(data, game_name)
        if err:
            problems.append(err)
            continue
        with open(os.path.join(FINAL, game_name), "wb") as f:
            f.write(data)
        done += 1
    print(f"installed {done}/{len(SOURCES)} finals into art/final/")
    for p in problems:
        print("  problem:", p)
    if done and not a.no_build:
        subprocess.run([sys.executable, os.path.join(ROOT, "art", "pipeline", "build_assets.py")], check=True)
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
