# art/final: drop-in final assets

Put final files here using the exact filenames from `art/HIGGSFIELD_PROMPTS.md` (and `audio/<name>.mp3`
for audio). Then run:

```
math/env/bin/python art/pipeline/build_assets.py   # rebuild frontend/apps/constrictor/static/assets + manifest.json
cd frontend && pnpm build                          # or just rebuild the frontend
```

No code changes are needed: `manifest.json` records `source: "final"` for every file found here, and the game
loads assets only through the manifest. Anything missing falls back to `art/placeholder/`.

The owner's Higgsfield symbol set (2026-09-30, 16 PNGs) is listed in `art/pipeline/fetch_finals.py`:
`math/env/bin/python art/pipeline/fetch_finals.py` downloads, checks and installs them here, then rebuilds the
manifest (needs network access to the Higgsfield image host). Files you have locally: `--from-dir DIR` (matched by
game filename or Higgsfield filename).

