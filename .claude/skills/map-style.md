# map-style

Guía de estilo visual del mapa de Senderos. Usarla para mantener consistencia en colores, líneas e íconos en toda la app.

## Variables CSS por tema

El estilo del mapa hereda las CSS custom properties definidas en `index.html`. Las relevantes para el mapa:

| Variable          | Green (default) | Light     | Dark      |
|-------------------|-----------------|-----------|-----------|
| `--accent`        | `#2f6b4f`       | `#16181a` | `#f4b942` |
| `--route-color`   | `#b3432c`       | `#2f6460` | `#f4b942` |
| `--track-color`   | `#2f6b4f`       | `#2f6460` | `#f4b942` |
| `--accent-soft`   | `#e9f0e4`       | `#f2f3f4` | `#242015` |

## Líneas en el mapa (Leaflet polylines)

| Tipo de línea        | Color               | Weight | Opacity | DashArray |
|----------------------|---------------------|--------|---------|-----------|
| Track grabado        | `--route-color`     | 5      | 0.9     | ninguno   |
| Ruta planificada     | `--track-color`     | 4      | 0.85    | `"1 8"`   |
| Ruta vista (grabada) | `#b3432c`           | 5      | 0.9     | ninguno   |
| Ruta vista (planeada)| `#2f6b4f`           | 5      | 0.9     | `"1 8"`   |

## Marcadores

| Elemento             | Estilo                                                         |
|----------------------|----------------------------------------------------------------|
| Posición actual      | `circleMarker` radio 8, borde blanco 3px, fill `#2f6b4f`      |
| Círculo de precisión | `circle`, color `#2f6b4f`, weight 1, opacity 0.3, fill 0.08   |
| Punto de plan        | `circleMarker` radio 5, borde blanco 2px, fill `#2f6b4f`      |

## Capa de trails externos

- Waymarked Trails hiking: `https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png`
- Opacity: 0.85
- Solo se muestra cuando el usuario la activa (toggle en el mapa)

## Reglas generales

- Nunca usar colores hardcodeados en JS para elementos del mapa — leer la variable CSS en runtime con `getComputedStyle(document.body).getPropertyValue('--route-color').trim()` si hace falta
- El grosor de línea (weight) no cambia entre temas
- Los marcadores de posición actual siempre usan `#2f6b4f` independientemente del tema (es el color de la marca GPS, no del acento)
- Para nuevas capas o íconos, elegir colores de la paleta del tema activo, nunca inventar nuevos colores
