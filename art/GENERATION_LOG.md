# Higgsfield generation log

Budget: at most **321.7 credits** (60 % of the 536.2 available at session start). Other activity on the
same account (e.g. a 10-credit MiniMax H3 job at 20:03 UTC that this session did not run) is not counted here.
Project: "CONSTRICTOR (Studio 12) game art" (`b1439b8c-1057-43e6-9600-f2a0568706ee`).

| # | Date (UTC) | Asset | Model | Settings | Job IDs | Credits |
|---|---|---|---|---|---|---|
| 1 | 2026-09-29 20:55 | H1 Black Opal: style-lock drafts ×4 | gpt_image_2_5 (flare) | low, 1k, 1:1, transparent | 19308b8a-6558-48b5-918c-e8cf027def80, ff0c7604-50a6-4d42-b5a9-2c6b945f2f78, c2eb4c99-f747-408f-8ec9-b17954401fa2, 210dee9a-2b1f-4c2b-9028-2c60ee264aa3 | 1.00 |
| 2 | 2026-09-29 20:55 | Snake head (top-down): style-lock drafts ×4 | gpt_image_2_5 (flare) | low, 1k, 1:1, transparent | dff093d1-5646-4237-bf15-3650132698fe, cf003446-36aa-42c2-bfaf-770a26ba42e5, d6c7b171-53cd-4de3-b32e-34fc36251c76, c9883eb9-1939-4b97-b5f7-579f508adb06 | 1.00 |

**Running total: 2.00 credits.**

Prompts: see `H1` and `SNAKE_HEAD` in `art/HIGGSFIELD_PROMPTS.md`.

## Why generation paused after the drafts
All eight drafts completed (1024×1024 RGBA with real transparency, checked in the Higgsfield sandbox).
But this cloud container cannot download them: Higgsfield serves results from
`d8j0ntlcm91z4.cloudfront.net` (generations) and `d2ol7oe51mr4n9.cloudfront.net` (uploads), and the
environment's egress policy blocks both (HTTP 403). Without importing, no asset can be reviewed against the
style bible or post-processed into the build, so spending credits on finals would be blind. See DECISIONS D-020.
**To resume:** allow those two hosts in the environment's network settings (or download the files
manually into `art/final/` using the filenames in `HIGGSFIELD_PROMPTS.md`).
