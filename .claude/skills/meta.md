# meta

Skill de meta-aprendizaje: cómo trabajar mejor en el proyecto Senderos a lo largo del tiempo, no una tarea puntual.

## Cuándo aplicar

- Al cierre de un bloque de trabajo con varios cambios (no cada mensaje).
- Cuando el usuario corrige el mismo tipo de cosa dos o más veces.
- Cuando `CLAUDE.md` o algún skill del proyecto queda desactualizado respecto al código real.

## Qué hacer

- Retro corta al cerrar un bloque de trabajo: qué funcionó, qué costó, qué hubo que rehacer. Dos o tres líneas, no un documento.
- Si el usuario corrige el mismo tipo de cosa más de una vez, proponer explícitamente actualizar `CLAUDE.md` o ajustar/crear un skill del proyecto para no repetir el error.
- Antes de asumir que un skill o `CLAUDE.md` describe el estado actual, verificar contra el código real. (Ya pasó una vez acá: `CLAUDE.md` describía un stack React Native + Expo + Supabase que nunca se implementó; el código real es una PWA vanilla.) Si hay divergencia, avisar y corregir el documento — no seguir la instrucción vieja a ciegas.
- Mantener `CLAUDE.md` como la fuente de verdad corta y viva del proyecto. Cualquier decisión de alcance o arquitectura que se tome en una conversación pero no quede reflejada ahí se va a perder — proponer actualizarlo en el momento en que se toma esa decisión.

## Qué NO hacer

- No convertir esto en un ritual pesado: nada de documentos largos de "lecciones aprendidas" por sesión. Es para detectar patrones que se repiten, no para generar overhead.
