# gpx-tools

Skill para parsear, validar y generar archivos GPX dentro del proyecto Senderos.

## Parsear un GPX

Al leer un archivo GPX, extraer siempre:
- `<trkpt lat="" lon="">` — coordenadas de cada punto
- `<ele>` — altitud (puede estar ausente)
- `<time>` — timestamp ISO 8601 (puede estar ausente)
- `<name>` del track — usarlo como nombre sugerido de la ruta

Reglas de validación al parsear:
- Mínimo 2 puntos válidos (lat/lon finitos)
- Descartar puntos con lat/lon NaN o fuera de rango (-90/90, -180/180)
- Si hay timestamps, verificar que sean crecientes (sin saltos negativos)

## Validar un track

Antes de aceptar un GPX como válido, chequear:
1. Al menos 2 puntos con coordenadas finitas
2. Distancia total > 0 metros
3. Si hay elevación, que al menos el 40% de los puntos la tengan (umbral de `computeElevation` en app.js)
4. Sin puntos duplicados consecutivos (mismo lat/lon exacto)
5. Sin saltos imposibles (>500 m entre puntos consecutivos sin tiempo o con tiempo < 1 s)

## Generar un GPX

Al exportar, seguir el formato ya usado en `buildGpx()` en `app.js`:
- Encoding UTF-8, versión GPX 1.1
- Creator: `"Senderos"`
- Incluir `<ele>` solo si el punto tiene altitud
- Incluir `<time>` solo si el punto tiene timestamp
- Escapar HTML en el nombre del track

## Notas de implementación

- El parser está en `app.js` → función `parseGpx(text)`
- El generador está en `app.js` → función `buildGpx(route)`
- Para tests unitarios, usar casos de borde: GPX vacío, un solo punto, sin elevación, sin timestamps, coordenadas inválidas
