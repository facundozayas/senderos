# Senderos

A personal app for discovering, planning, and recording trekking, biking, and running routes: map, elevation profile, live GPS recording, history, and stats — all in the browser, no account, no backend.

## Features

- **Map** powered by OpenStreetMap (via Leaflet), with an optional mapped-trails overlay (Waymarked Trails).
- **Place search** via Nominatim.
- **Record a route** live with your phone's GPS, with distance, time, pace, and elevation profile updating in real time.
- **Plan a route** by tapping the map, no need to walk it first.
- **GPX import/export**, plus full JSON backup/restore.
- **Offline maps**: download the area you're viewing for use without signal, or import a local raster `.pmtiles` file.
- **History and stats**: saved routes, activity filters, averages, per-period totals, and personal records.
- **Three visual themes** (outdoor green, light, dark).
- **Crash recovery**: if the app closes mid-recording, it offers to recover the in-progress track on reopen.

All data is stored in the browser's `localStorage` — there's no server, no account, and no cost to run.

## Running it locally

This is a vanilla PWA (HTML/CSS/JS), no build step. Serve it over HTTP (not `file://` — the service worker and some browser APIs require it):

```bash
cd extracted
python -m http.server 8080
```

Then open `http://localhost:8080`. You can also install it as a PWA from there (Add to Home Screen / Install app).

## Project structure

```
extracted/
  index.html        UI markup and styles
  app.js             App logic (state, map, recording, history, stats)
  geo.js             Pure geospatial/GPX logic, unit-testable (window.SenderosCore)
  service-worker.js  App-shell cache + offline tiles
  manifest.json      PWA manifest
  vendor/            Leaflet and pmtiles.js, vendored locally (no CDN)
tests/               Test suite (Node, node:test + jsdom)
.claude/skills/      Working guidelines for Claude Code on this project
CLAUDE.md            Project instructions for working with Claude Code
```

## Tests

Geospatial and GPX logic (distance, elevation, GPX parsing/generation, route validation) has unit tests. Requires Node.js 18+:

```bash
npm install
npm test
```

`jsdom` is a devDependency used only by the tests that need `DOMParser`/`document` — the app itself ships with zero dependencies and no build step.

## Data sources & attribution

- Map tiles and trail data: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, licensed under the [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/). Attribution is shown on the map itself, as required by the license.
- Trail overlay: [Waymarked Trails](https://waymarkedtrails.org/).
- Place search: [Nominatim](https://nominatim.org/), used per its [usage policy](https://operations.osmfoundation.org/policies/nominatim/) (the app rate-limits searches to comply with the 1 request/second limit).
- Mapping library: [Leaflet](https://leafletjs.com/) (vendored, [BSD-2-Clause](https://github.com/Leaflet/Leaflet/blob/main/LICENSE)).
- Local map file support: [PMTiles](https://github.com/protomaps/PMTiles) (vendored, [BSD-3-Clause](https://github.com/protomaps/PMTiles/blob/main/LICENSE)).
- Fonts loaded from Google Fonts (see Privacy below).

## Privacy

There's no backend and no analytics. Data you record or import stays in your browser's `localStorage` on your own device — it's never sent anywhere by the app itself. That said, a few things do leave your device as part of normal use, to third-party services this app depends on:

- Anything you type into the place search is sent to Nominatim's public API.
- The map view (as tile coordinates, not your exact location) is requested from OpenStreetMap's and Waymarked Trails' tile servers as you pan/zoom.
- Page fonts are loaded from Google Fonts, which — like any Google Fonts embed — can see the requesting IP address.

None of this is unusual for a map-based web app, but it's worth knowing if you plan to use this somewhere privacy-sensitive.

## License

No license has been chosen yet for this repository, so by default all rights are reserved — even though the repo is public, that doesn't grant permission to reuse the code. If you want others to be able to use, modify, or redistribute it, add a `LICENSE` file (e.g. MIT) before relying on that.
