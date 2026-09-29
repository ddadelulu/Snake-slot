"""Package the Stake Engine upload set for git, and restore it.

GitHub rejects files over 100 MB, and some book files are larger. `pack` copies the upload set
(index.json, lookUpTable_<mode>_0.csv, books_<mode>.jsonl.zst) from library/publish_files/ to
games/constrictor/publish/, splits every file over 95 MB into `.partNN` chunks, and writes SHA256SUMS
(of the whole files). `join` rebuilds the whole files into a target folder and verifies every checksum.

Usage (from /math):
  env/bin/python publish_parts.py pack
  env/bin/python publish_parts.py join [--out <dir>]   # default: games/constrictor/publish/upload/
"""

from __future__ import annotations

import argparse
import glob
import hashlib
import os
import shutil

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "games", "constrictor", "library", "publish_files")
DST = os.path.join(HERE, "games", "constrictor", "publish")
CHUNK = 95 * 1024 * 1024


def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def pack():
    os.makedirs(DST, exist_ok=True)
    for old in glob.glob(os.path.join(DST, "*.part*")) + glob.glob(os.path.join(DST, "*.zst")) + glob.glob(os.path.join(DST, "*.csv")):
        os.remove(old)
    names = sorted(os.listdir(SRC))
    sums = []
    for name in names:
        src = os.path.join(SRC, name)
        if not os.path.isfile(src):
            continue
        sums.append(f"{sha256(src)}  {name}")
        size = os.path.getsize(src)
        if size <= CHUNK:
            shutil.copyfile(src, os.path.join(DST, name))
            print(f"{name}: {size / 1e6:.1f} MB")
            continue
        with open(src, "rb") as f:
            i = 0
            while True:
                block = f.read(CHUNK)
                if not block:
                    break
                with open(os.path.join(DST, f"{name}.part{i:02d}"), "wb") as out:
                    out.write(block)
                i += 1
        print(f"{name}: {size / 1e6:.1f} MB -> {i} parts")
    with open(os.path.join(DST, "SHA256SUMS"), "w", encoding="UTF-8") as f:
        f.write("\n".join(sums) + "\n")


def join(out: str):
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(DST, "SHA256SUMS"), encoding="UTF-8") as f:
        entries = [line.split("  ", 1) for line in f.read().splitlines() if line.strip()]
    bad = 0
    for digest, name in entries:
        target = os.path.join(out, name)
        whole = os.path.join(DST, name)
        if os.path.exists(whole):
            shutil.copyfile(whole, target)
        else:
            parts = sorted(glob.glob(os.path.join(DST, f"{name}.part*")))
            if not parts:
                print(f"MISSING {name}")
                bad += 1
                continue
            with open(target, "wb") as w:
                for p in parts:
                    with open(p, "rb") as r:
                        shutil.copyfileobj(r, w)
        ok = sha256(target) == digest
        bad += not ok
        print(f"{'OK ' if ok else 'BAD'} {name}")
    if bad:
        raise SystemExit(f"{bad} file(s) failed verification")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["pack", "join"])
    ap.add_argument("--out", default=os.path.join(DST, "upload"))
    a = ap.parse_args()
    pack() if a.cmd == "pack" else join(a.out)


if __name__ == "__main__":
    main()
