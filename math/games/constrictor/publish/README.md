# CONSTRICTOR: Stake Engine upload set (math v1)

The math files to upload to Stake Engine for all four modes: `index.json`, `lookUpTable_<mode>_0.csv`
and `books_<mode>.jsonl.zst`.

GitHub rejects files over 100 MB, so larger book files are stored as `.partNN` chunks.
`SHA256SUMS` holds the checksums of the **whole** files.

Rebuild the upload folder and verify every checksum:

```
cd math
env/bin/python publish_parts.py join          # -> games/constrictor/publish/upload/
```

Upload the contents of `publish/upload/`. The files are byte-identical to `library/publish_files/`
produced by `games/constrictor/run.py`, and are the ones checked by `verify_constrictor.py` (see
`docs/MATH_REPORT.md`).
