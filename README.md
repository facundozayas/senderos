# Senderos

Una app tipo Komoot para descubrir, planificar y registrar rutas de trekking, bici y running: mapa, perfil de elevación, grabación por GPS en vivo, historial y estadísticas — todo en el navegador, sin cuenta ni backend.

## Características

- **Mapa** con OpenStreetMap (Leaflet) y una capa opcional de senderos mapeados (Waymarked Trails).
- **Buscador de lugares** vía Nominatim.
- **Grabar una ruta** en vivo con el GPS del celular, con distancia, tiempo, ritmo y perfil de elevación en tiempo real.
- **Planificar una ruta** tocando el mapa, sin necesidad de salir a caminarla primero.
- **Import/export en GPX**, más backup/restore completo en JSON.
- **Mapas offline**: descargá el área que estás viendo para verla sin señal, o importá un archivo `.pmtiles` raster local.
- **Historial y stats**: rutas guardadas, filtros por actividad, promedios, totales por período y récords personales.
- **Tres temas visuales** (verde outdoor, claro, oscuro).
- **Recuperación automática**: si la app se cierra en medio de una grabación, al reabrirla te ofrece recuperarla.

Todos los datos se guardan en `localStorage` del navegador — no hay servidor, no hay cuenta, no hay costo.

## Cómo correrla

Es una PWA vanilla (HTML/CSS/JS), sin build step. Para probarla localmente hace falta servirla por HTTP (no `file://`, porque el service worker y algunas APIs del navegador lo requieren):

```bash
cd extracted
python -m http.server 8080
```

Y abrís `http://localhost:8080` en el navegador. También podés instalarla como PWA desde ahí (Agregar a pantalla de inicio / Instalar app).

## Estructura del proyecto

```
extracted/
  index.html        UI y estilos
  app.js            Lógica de la app (estado, mapa, grabación, historial, stats)
  geo.js            Lógica geoespacial y GPX pura, testeable (window.SenderosCore)
  service-worker.js Cache del app shell + tiles offline
  manifest.json     Manifest de PWA
  vendor/           Leaflet y pmtiles.js vendorizados (sin CDN)
tests/              Suite de tests (Node, node:test + jsdom)
.claude/skills/     Guías de trabajo para Claude Code sobre este proyecto
CLAUDE.md           Instructivo del proyecto para trabajar con Claude Code
```

## Tests

La lógica geoespacial y de GPX (distancia, elevación, parseo/generación de GPX, validación de ruta) tiene test unitario. Requiere Node.js 18+:

```bash
npm install
npm test
```

`jsdom` es devDependency solo para los tests que necesitan `DOMParser`/`document` — la app en sí no tiene ninguna dependencia ni build step.

## Stack

HTML/CSS/JS vanilla · [Leaflet](https://leafletjs.com/) · [OpenStreetMap](https://www.openstreetmap.org/) · [Waymarked Trails](https://waymarkedtrails.org/) · [Nominatim](https://nominatim.org/) · [PMTiles](https://github.com/protomaps/PMTiles)
