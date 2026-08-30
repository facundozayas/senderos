# Senderos — Instructivo del proyecto (para Claude)

## 1. Visión del producto

Senderos es una app para descubrir, planificar y registrar rutas de trekking/ciclismo/running: mapa, perfil de elevación, GPS tracking en vivo, historial y stats.

**Usuario objetivo:** el propio usuario, uso personal (no multiusuario, no backend con cuentas).

## 2. Estado actual — es una PWA vanilla, no la propuesta original

Este código vive en `extracted/` y ya es funcional:

- **Frontend:** HTML/CSS/JS vanilla, sin build step ni framework. La UI y el manejo de estado están en `extracted/app.js` (un único IIFE) + `extracted/index.html`. La lógica geoespacial y de GPX pura (sin DOM salvo `escapeHtml`/`parseGpx`) vive separada en `extracted/geo.js` (patrón UMD: se carga como `<script>` en el navegador exponiendo `window.SenderosCore`, y también con `require()` desde los tests en Node) — se separó específicamente para poder testear `haversine`, `totalDistance`, `computeElevation`, `parseGpx`, `buildGpx` y `validateRoute` sin necesitar un DOM real de navegador.
- **Mapa:** Leaflet (vendored en `extracted/vendor/leaflet/`), tiles de OpenStreetMap (`tile.openstreetmap.org`), capa opcional de senderos de Waymarked Trails.
- **Búsqueda de lugares:** Nominatim (OpenStreetMap), con rate-limit manual de 1.1s entre búsquedas.
- **Storage:** `localStorage` del navegador (`senderos_routes_v3`, etc.) — no hay backend ni cuenta de usuario. Backup/restore manual vía export/import de JSON.
- **Offline:** service worker (`extracted/service-worker.js`) cachea el app shell; tiles de mapa se pueden descargar bajo demanda (`caches` API) para ver el área sin señal.
- **Mapas locales:** soporte para importar archivos `.pmtiles` raster del dispositivo (vendored `extracted/vendor/pmtiles/`) como capa offline — no se guarda el archivo, hay que re-elegirlo cada sesión.
- **Formato de import/export de rutas:** GPX (parser/generador propio en `extracted/geo.js`, ver skill `gpx-tools`).

Ya cubre gran parte del alcance de un MVP: buscar lugar, elegir actividad (trekking/bike/running), grabar ruta con GPS en vivo (con perfil de elevación calculado en el momento), planificar ruta tocando el mapa, ver/exportar/borrar rutas guardadas, stats (promedios, totales por período, récords personales), temas visuales (green/light/dark).

> Nota histórica: una versión anterior de este documento proponía migrar a React Native + Expo + Supabase/PostGIS. Esa migración no se hizo — el proyecto sigue siendo la PWA vanilla. Si en algún momento se decide migrar de verdad, actualizar esta sección explícitamente antes de tocar código.

## 3. Fuera de alcance (por ahora)

- Features sociales (seguir usuarios, comentarios, feed, comunidad)
- Navegación turn-by-turn en tiempo real con voz
- Cuentas de usuario / sync entre dispositivos / backend propio
- Monetización

## 4. Cómo quiero que trabajes en este proyecto (Claude Code / agentes)

- Antes de tocar código existente, explorá `extracted/app.js` y `extracted/index.html` para entender la estructura actual — no asumas.
- Para cualquier feature nueva o cambio de arquitectura (ej. mover a un build step, agregar backend), primero armá un plan corto (modo **Plan**) y esperá confirmación antes de escribir código.
- Convenciones del código existente: JS vanilla en un único IIFE en `app.js`, sin dependencias de build. Nombres de variables/funciones en inglés, comentarios mínimos.
- Toda lógica geoespacial (distancia, elevación, parseo/generación de GPX, validación de ruta) vive en `extracted/geo.js` y tiene test unitario en `tests/` (Node's `node:test` + `jsdom` como devDependency solo para los tests de GPX, que necesitan `DOMParser`). Correr con `npm install && npm test` desde la raíz del repo. Si agregás lógica nueva ahí, agregale test en el mismo cambio.
- Antes de guardar una ruta se corre automáticamente `validateRoute()` (implementación de `route-qa` en `geo.js`) vía el helper `trySaveRoute()` en `app.js` — no llames a `addRoute()` directo desde un flujo nuevo, pasá siempre por `trySaveRoute()`.
- Commits chicos y descriptivos, un cambio lógico por commit. **El repo todavía no tiene ningún commit** — el primer commit debería armarse con cuidado (revisar qué se incluye del zip vs. extracted vs. .claude).
- Si algo del alcance no está claro, preguntá antes de asumir — no completes gaps de producto por tu cuenta.

## 5. Skills del proyecto

Ya existen en `.claude/skills/` y siguen vigentes para este código:

- **gpx-tools** — parsear, validar y generar archivos GPX (coincide con `parseGpx`/`buildGpx` en `geo.js`).
- **route-qa** — checklist de calidad de datos de ruta antes de guardarla.
- **map-style** — guía de estilo visual del mapa (colores por tema, líneas, marcadores).
- **gsd** — modo rápido para tareas concretas de bajo riesgo, sin resignar las salvaguardas de este documento.
- **meta** — meta-aprendizaje: cuándo hacer retro, cuándo actualizar este documento o los skills, cómo no repetir errores ya corregidos.

## 6. Criterios de éxito del MVP

Un usuario puede: buscar un lugar cerca suyo → verlo en el mapa → grabar una ruta en vivo con el GPS del celular sin perder precisión relevante → guardarla y volver a verla (incluso offline si descargó el área) → exportarla en GPX.
