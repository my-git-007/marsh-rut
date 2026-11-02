# Marsh Rut

A moose-calling game. You sit in a tree stand over a 500 × 800 yard beaver marsh at first light and call with real
cow-moose recordings. The aim is to bring a bull in without him winding you. Play solo in the browser, or share one
marsh with up to eight hunters, each in their own stand.

## Running it

```
npm install
npm run dev            # the game at http://localhost:5173 (solo)
npm run server         # the multiplayer server on :8080
```

To hunt the same marsh from two windows, open `http://localhost:5173/?server=ws://localhost:8080` in both.

| Command | What it does |
|---|---|
| `npm run build` | builds the game into `dist/` (static files for any web host) |
| `npm run preview` | serves `dist/` locally |
| `npm run check` | runs the shared simulation without a browser for an hour of marsh time |
| `npm run test:mp` | starts a server and connects three hunters. Checks that they share the animals and that one hunter's call reaches a bull |
| `npm run check:sounds` | lists sounds that may not be published (see SOUNDS.md) |

Test and showcase pages (solo play):
- `?showcase=1` shows the reference-sheet bull.
- Test scenes: `?test=bull&debug`, `?test=fight`, `?test=antlers`, `?test=lineup`, `?test=cows`, `?test=wild`.
- `&stand=3` puts you in another stand.
- `&debug` opens the spotter readout (or press G in the game).

## How it is put together

```
shared/            runs in the browser and on the server; no graphics or sound
  util.js            maths, noise, the seedable random source
  world.js           the marsh: shape, stream, pond, pools, ground height, the 8 stands, the shrubs bulls thrash
  wind.js            the wind (direction, gusts, swirl)
  protocol.js        message formats and rates between browser and server
  sim/               the animals' behaviour
    sim.js             the host: hunters, timers, spawning, calls and pours, snapshots, test scenes
    bull.js            a bull's state machine (distant → coming → timber → step out → hold → approach …)
    cows.js            a cow and her calves
    wildlife.js        bear, wolves, coyotes, raccoon
    body.js            movement and posture flags
    bullparams.js      a bull's class, antlers, temperament and coat
server/server.js   one shared marsh over WebSockets
client/            the browser game (Vite)
  index.html         page, HUD, start screen
  assets/            sounds/ and reference/ (served as separate files the browser can cache)
  src/
    main.js            start-up and frame loop
    net/hosts.js       LocalHost (simulation in the tab) and RemoteHost (server + interpolation)
    views/             how animals look and move on screen; world-events.js turns host events into sounds and effects
    models/            sculpted moose, antlers, reference bull, critters
    render/            renderer, textures, sky, terrain, water, ridges, vegetation, fx, birds
    audio/audio.js     mixer, spatial sound, recordings, ambience
    ui/                input and HUD
    calls.js           your calls and the water pour
tools/             checks and one-off tools (split-client.mjs cut the original single file into these modules)
```

**The host decides and the browsers draw.** Whoever hosts the marsh runs `shared/sim`: the server in multiplayer,
or the tab itself in solo play.
- Every bull hears every hunter's calls, delayed by the time sound takes to travel the distance.
- A bull winds any hunter he is downwind of.
- A bull works toward one hunter at a time.

The host sends a snapshot of every animal 10 times a second: id, position, heading, speed, gait, posture flags,
and where it is looking. It also sends events for anything that makes a sound. Each browser:
- draws about 150 ms behind the newest snapshot and interpolates between snapshots;
- builds each animal from the description the host sent with it, which includes a seed, so antlers and coat look
  the same in every browser;
- poses the legs, head, jaw and ears itself.

Birds and background sounds are scenery, so each browser makes its own.

More hunters bring more animals: up to one bull per two hunters (four at most), and more cows.

## Hosting

**The game is static files, served from GitHub Pages.** `.github/workflows/pages.yml` builds and publishes `dist/`.
- It runs only when started by hand (Actions → "Deploy game to GitHub Pages").
- During testing it also publishes the BBC archive recordings; the sounds check only warns (see SOUNDS.md).
- In the repository settings, set Pages → Source to "GitHub Actions".
- To turn on multiplayer for the published game, add a repository variable `VITE_SERVER_URL` = `wss://<your server>`.

**The shared marsh for multiplayer runs on a small always-on Node server.** The marsh lives in the server's memory,
so run exactly one instance.
- Fly.io: `fly launch --no-deploy` (choose an app name; `fly.toml` is ready), then `fly deploy`.
- Render: New → Blueprint → this repository (`render.yaml`). The free plan sleeps when idle, so use a paid instance.
- Anywhere with Docker: `docker build -t marsh-rut-server . && docker run -p 8080:8080 marsh-rut-server`.

Server settings (environment variables):
- `PORT`
- `ALLOWED_ORIGINS`: comma-separated, e.g. `https://you.github.io`, so that only your game page can connect.
- `MARSH_DEBUG=1`: adds a `/debug` readout. Keep it off in public.

`GET /health` reports the number of hunters and animals.

One server process runs one marsh of eight stands. Running several marshes at once (rooms) would need the wind moved
from a module-level object into each simulation. Everything else is already per simulation.

## Models

The animals are sculpted in code (`client/src/models`). Swapping in Meshy.ai models later only affects the views:
`client/src/views/moose-view.js` needs a root object, leg, neck, head, jaw and ear bones, and a few materials. The
behaviour and networking don't change.

## Sounds

See [SOUNDS.md](SOUNDS.md). The BBC archive recordings are licensed for personal use only. They are included for
testing while permission is sought; they must be cleared or replaced before a real public launch.
