# art/final: drop-in final assets

Put final files here using the exact filenames from `art/HIGGSFIELD_PROMPTS.md` (and `audio/<name>.mp3`
for audio). Then run:

```
math/env/bin/python art/pipeline/build_assets.py   # rebuild frontend/apps/constrictor/static/assets + manifest.json
cd frontend && pnpm build                          # or just rebuild the frontend
```

No code changes are needed: `manifest.json` records `source: "final"` for every file found here, and the game
loads assets only through the manifest. Anything missing falls back to `art/placeholder/`.
