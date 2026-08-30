# gsd

Skill de productividad para avanzar rápido en tareas concretas de Senderos, sin diluir las salvaguardas ya definidas en `CLAUDE.md`.

## Cuándo aplicar

- Pedidos acotados y de bajo riesgo: fix de un bug puntual, ajuste visual, pequeña feature ya dentro del alcance definido del MVP.
- El usuario pide iterar rápido sobre algo ya acordado ("dale", "segui", "probá esto").

## Cómo actuar

- Ir directo a `extracted/app.js` / `extracted/index.html`, hacer el cambio mínimo necesario — sin armar un plan largo para algo chico.
- No repreguntar por detalles que ya están resueltos en `CLAUDE.md` o en el código existente. Leer primero, preguntar solo lo que de verdad falta.
- Un cambio lógico por commit, chico y descriptivo (solo si el usuario pidió commitear — nunca por cuenta propia).
- Verificación rápida: probar el flujo tocado en el navegador (skill `run`) en vez de escribir una suite de tests para un cambio menor.

## Cuándo NO acelerar (seguir el proceso normal de CLAUDE.md)

- Lógica geoespacial (distancia, elevación, parseo/generación de GPX) — sigue rigiendo "todo lleva test unitario".
- Cambios que tocan el alcance del producto o la arquitectura — sigue rigiendo modo **Plan** + confirmación.
- Cambios al formato de storage de rutas guardadas (`senderos_routes_v3` y afines) — riesgo de romper datos ya guardados de usuarios reales.
- Cualquier ambigüedad real sobre qué se quiere — preguntar, no asumir.
