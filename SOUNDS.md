# Sounds: what may be published

Every recording lives in `client/assets/sounds/`, one folder per kind. Where each folder came from is listed in
`client/assets/sounds/sources.json`.

| Folder | What | Source | May be published? |
|---|---|---|---|
| `cow-calls/long`, `cow-calls/coaxing` | your calls (keys 1 and 2) | your own recordings | yes |
| `bull-replies` | what an answering bull plays | provided by you | yes |
| `wild-recordings` | bull grunts, antler raking, willow brush | BBC Sound Effects archive | **no** |
| `ambient/<species>` | birds, loon, cranes, geese, wolves, coyotes, forest bed, wind | BBC Sound Effects archive | **no** |
| `effects/<kind>` | antler fight, ducks flushing, raven wings, wading, water pour | BBC Sound Effects archive | **no** |

The BBC Sound Effects archive licence (RemArc) allows personal, educational or research use only. That covers
playing the game yourself, but **not** putting it on a public website. `npm run check:sounds` lists what is not yet
cleared.

**Current status (testing):** the BBC recordings are deliberately included in the repository and the published test
build while permission is sought or replacements are found. The Pages workflow runs the check as a warning only. Before
a real public launch, clear or replace every folder below and remove `continue-on-error` from the check step in
`.github/workflows/pages.yml` so it blocks again.

## Replacing a folder

1. Find recordings you may publish: your own, CC0 (Freesound has a CC0 filter), or US National Park Service
   recordings (generally public domain, but check each item's rights note). CC BY is fine too if you credit the
   author.
2. Put them in the same folder. File names don't matter, because the game picks clips by folder. The exception is
   `wild-recordings`, which uses these names: `grunt0` to `grunt7`, `rake_fir`, `rake_willow`, `willow_walk`.
3. Update that folder's entry in `sources.json` (source, licence, `"public": true`). Credit the authors in the README
   if the licence asks for it.
4. `npm run check:sounds` should then pass.

The game keeps working if a folder is emptied: bulls fall back to synthesized grunts, and birds to synthesized songs.
