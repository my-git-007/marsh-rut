# Hunting LTD

A hunting game. The first hunt is moose calling at a beaver marsh. (The code and the web addresses still use the
project's first name, `marsh-rut`.)

A moose-calling game. You sit in a tree stand over a 500 × 800 yard beaver marsh at first light and call with real
cow-moose recordings. The aim is to bring a bull in without him winding you. Online, each player logs in to an
account and hunts their own private marsh, which runs on the game server. Offline (no server set up), the marsh runs in
the browser.

## Running it

```
npm install
npm run dev            # the game at http://localhost:5173 (offline: the marsh runs in the tab, no login)
```

To try online play locally without Firebase, start the server with logins switched off and point the game at it. The
login screen then asks only for a name.
```
MARSH_AUTH=off npm run server                      # PowerShell: $env:MARSH_AUTH='off'; npm run server
http://localhost:5173/?server=ws://localhost:8080
```
`?solo` always plays offline.

| Command | What it does |
|---|---|
| `npm run build` | builds the game into `dist/` (static files for any web host) |
| `npm run preview` | serves `dist/` locally |
| `npm run check` | runs the shared simulation without a browser for an hour of marsh time |
| `npm run test:mp` | starts local servers and checks private marshes: each player gets their own, a bull reacts to that player's call only, a second tab takes over, a reload returns to the same marsh, a bad login is refused |
| `npm run bench` | how much CPU 40 marshes take (about 0.02% of a core each) |
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
server/server.js   one private marsh per logged-in player, over WebSockets
server/auth.js     checks the player's Firebase login token
client/            the browser game (Vite)
  index.html         page, HUD, start screen
  assets/            sounds/ and reference/ (served as separate files the browser can cache)
  src/
    main.js            start-up and frame loop
    net/hosts.js       LocalHost (simulation in the tab) and RemoteHost (server + interpolation)
    auth/auth.js       accounts through Firebase: log in, create account, password reset, log out
    ui/account.js      the account forms on the start screen
    views/             how animals look and move on screen; world-events.js turns host events into sounds and effects
    models/            sculpted moose, antlers, reference bull, critters
    render/            renderer, textures, sky, terrain, water, ridges, vegetation, fx, birds
    audio/audio.js     mixer, spatial sound, recordings, ambience
    ui/                input and HUD
    calls.js           your calls and the water pour
tools/             checks and one-off tools (split-client.mjs cut the original single file into these modules)
```

**The host decides and the browser draws.** Whoever hosts the marsh runs `shared/sim`: the server when online,
or the tab itself offline. A simulation can hold up to eight hunters (one per stand), which leaves room for hunting
with friends later; online, each marsh currently has one.
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

Each marsh has its own wind. The marsh layout never changes, so all the marshes share it.

## Hosting

**The game is static files, served from GitHub Pages.** `.github/workflows/pages.yml` builds and publishes `dist/`.
- It runs only when started by hand (Actions → "Deploy game to GitHub Pages").
- During testing it also publishes the BBC archive recordings; the sounds check only warns (see SOUNDS.md).
- In the repository settings, set Pages → Source to "GitHub Actions".
- To turn on multiplayer for the published game, add a repository variable `VITE_SERVER_URL` = `wss://<your server>`.

**The marshes run on a small always-on Node server.** They live in the server's memory, so run exactly one instance.
- Each logged-in player gets their own marsh.
- If the player reloads or the connection drops, the marsh waits `KEEP_MINUTES` (5) for them, then closes.
- Opening the game in a second tab moves the player there.
- Fly.io: `fly launch --no-deploy` (choose an app name; `fly.toml` is ready), then `fly deploy`.
- Render: New → Blueprint → this repository (`render.yaml`). The free plan sleeps when idle, so use a paid instance.
- Anywhere with Docker: `docker build -t marsh-rut-server . && docker run -p 8080:8080 marsh-rut-server`.

Server settings (environment variables):
- `PORT`
- `FIREBASE_PROJECT_ID`: required. Players' login tokens are checked against this project.
- `ALLOWED_ORIGINS`: comma-separated, e.g. `https://you.github.io`, so that only your game page can connect.
- `MAX_MARSHES` (40; `fly.toml` sets 100): how many marshes can be open at once.
- `KEEP_MINUTES` (5).
- `MARSH_AUTH=off`: no login; for local testing only.
- `MAX_CONN_PER_IP` (3): WebSocket connections at once per internet address.
- `MAX_NEW_PER_IP` (5): new marshes per address per hour.
- `HTTP_PER_MIN` (30): plain web requests per address per minute.
- `IDLE_MINUTES` (10).
- `MARSH_DEBUG=1`: adds a `/debug` readout. Keep it off in public.
- `RESEND_API_KEY` and `CONTACT_TO` (Fly secrets, not `fly.toml`): turn on the Contact form in the pause menu.
  `CONTACT_FROM` (optional): the sender; until you verify your own domain with Resend, the default
  `onboarding@resend.dev` can only send to the address your Resend account was created with.

`GET /health` reports the number of marshes, players and animals.

## Accounts

Players log in with an email and a password. They must confirm their email (a link Firebase sends when they sign
up) before the server opens a marsh for them. After 10 minutes without touching mouse, keyboard or screen, they are
logged out and their marsh is closed. A warning shows a minute before. [Firebase Authentication](https://firebase.google.com/docs/auth) (free)
does the account work:
- it stores the passwords;
- it sends the password-reset emails;
- it slows down password guessing.

The game shows the forms (`client/src/ui/account.js`). The server never sees a password: the browser sends a
short-lived ID token, and `server/auth.js` checks its signature with Google's public keys.

Setting it up:
1. Create a project at https://console.firebase.google.com.
2. Turn on the Email/Password sign-in method: Build → Authentication → Sign-in method.
3. Add the web address of the game to the authorized domains: Authentication → Settings → Authorized domains,
   e.g. `you.github.io`.
4. Register a web app (Project settings → Your apps → Web). Then copy `apiKey`, `authDomain`, `projectId` and
   `appId` into the repository variables `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
   `VITE_FIREBASE_PROJECT_ID` and `VITE_FIREBASE_APP_ID`. They identify the project and are not secret.
5. Set `FIREBASE_PROJECT_ID` on the server (`fly.toml`).
6. Optional: change the wording or sender name of the confirmation and reset emails (Authentication → Templates).
7. Restrict the API key to the game's web addresses, in Google Cloud console → APIs & Services → Credentials →
   "Browser key (auto created by Firebase)":
   - Application restrictions: Websites, with `https://my-git-007.github.io/*`, `https://marsh-rut.firebaseapp.com/*`
     (the pages the email links open) and `http://localhost:*/*` (development).
   - API restrictions: Identity Toolkit API and Token Service API.

## Contact form

The pause menu (Esc) has a Contact form. The server emails each message to you through [Resend](https://resend.com)
(free up to 3,000 emails a month), with the player's address as Reply-To. Limits: 3 messages an hour and 10 a day per
account, 6 an hour per internet address. To switch it on:
1. Sign up at resend.com with the address that should receive the messages, and create an API key (Sending access).
2. `flyctl secrets set RESEND_API_KEY=re_... CONTACT_TO=you@example.com`

## Moving to your own domain

Put the new address (e.g. `hunting.ltd`) in all of these, keeping the old ones until the move is done:
1. GitHub: Settings → Pages → Custom domain. Add the DNS records GitHub shows, then tick "Enforce HTTPS".
2. Firebase: Authentication → Settings → Authorized domains.
3. Google Cloud: the API key's website restrictions (`https://hunting.ltd/*`).
4. Server: `ALLOWED_ORIGINS` in `fly.toml`, comma-separated (`https://my-git-007.github.io,https://hunting.ltd`).
   Then run `flyctl deploy`.
The game uses relative paths, so it works at a domain's root without changes.

## Models

The animals are sculpted in code (`client/src/models`). Swapping in Meshy.ai models later only affects the views:
`client/src/views/moose-view.js` needs a root object, leg, neck, head, jaw and ear bones, and a few materials. The
behaviour and networking don't change.

## Sounds

See [SOUNDS.md](SOUNDS.md). The BBC archive recordings are licensed for personal use only. They are included for
testing while permission is sought; they must be cleared or replaced before a real public launch.
