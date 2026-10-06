# CSS del módulo Selección (generado, no editar a mano)

`seleccion.css` reemplaza al script en vivo `https://cdn.tailwindcss.com` que usaba
el módulo de Selección (portal del aspirante y panel admin). Ese script dependía de
una conexión externa en cada carga de página; si la red del usuario lo bloqueaba o
tardaba en responder, la página cargaba sin ningún estilo. Este archivo se sirve
desde el propio dominio de la app, así que no depende de terceros.

## Cuándo reconstruirlo

Cada vez que se agregue en `src/routes/seleccion.js` una clase de Tailwind que no se
usaba antes (ej. un color o tamaño nuevo), hay que volver a generar este archivo —
si no, esa clase nueva no tendrá su regla CSS y se verá sin estilo:

```
npm run build:css:seleccion
```

Esto lee `seleccion.input.css` (solo tiene `@import "tailwindcss";`), escanea el
proyecto buscando nombres de clases y escribe el resultado minificado en
`seleccion.css`. Hay que confirmar el archivo generado en el commit junto con el
cambio de `seleccion.js`.
