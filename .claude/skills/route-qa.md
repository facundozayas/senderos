# route-qa

Checklist de calidad para revisar una ruta de Senderos antes de guardarla o publicarla.

## Cuándo aplicar este skill

Antes de llamar a `addRoute()` en cualquier flujo: grabación, importación GPX, ruta planificada.

## Checklist

### Geometría
- [ ] Al menos 2 puntos con coordenadas válidas (lat/lon finitos y en rango)
- [ ] Sin puntos duplicados consecutivos (mismo lat/lon exacto)
- [ ] Sin saltos imposibles entre puntos consecutivos (>500 m en <1 s si hay timestamps)
- [ ] La ruta no forma un loop extraño que sugiera error de GPS (ida y vuelta en el mismo segundo)

### Distancia
- [ ] Distancia total > 0 m
- [ ] Distancia calculada con `totalDistance()` coincide con lo declarado (tolerancia 5%)
- [ ] Para rutas grabadas: distancia consistente con el tiempo (velocidad promedio razonable: <80 km/h para trekking/running, <120 km/h para bici)

### Elevación
- [ ] Si hay datos de elevación, al menos 40% de los puntos los tienen
- [ ] Sin saltos de elevación absurdos (>300 m entre puntos consecutivos)
- [ ] Desnivel acumulado (`elevGain`) recalculado y consistente con el perfil

### Metadatos
- [ ] Nombre no vacío y no es el placeholder por defecto ("Trail ...", "Planned route ...")
- [ ] Actividad asignada (`trekking`, `bike`, o `running`)
- [ ] Fecha en formato ISO válido

### Flags a reportar (no bloquean, pero avisar)
- Duración 0 en una ruta grabada (posible error de timer)
- Ruta muy corta (<100 m) — probablemente un accidente
- Elevación ausente en ruta de trekking con desnivel relevante

## Salida esperada

Al usar este skill, reportar:
- Checks que PASAN
- Checks que FALLAN (bloquean el guardado)
- Flags de advertencia (no bloquean)
- Recomendación final: GUARDAR / CORREGIR / DESCARTAR
