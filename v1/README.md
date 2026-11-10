# Lab v1 (frozen)

A copy of `apps/markets-study` at commit efbef8c, made by `apps/lab/tools/freeze_v1.py` on 2026-11-10.

- It reads the current Lab's public data (`../data/`), never v1's own private data.
- Each page has a banner that links back to the current Lab, and a noindex tag.
- `v1compat.js` fills two fields the public files leave out: a build date and the price source.
- Do not edit these files. Re-run the script instead.
