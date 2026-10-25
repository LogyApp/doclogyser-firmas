# Instrucciones para asistentes de IA — doclogyser-firmas (copia de CLAUDE.md)

Estas reglas aplican a cualquier asistente de IA que trabaje en este repositorio
(Claude en Visual Studio Code, Claude web, u otros). Léelas antes de cambiar código.

## 1. Flujo de trabajo obligatorio

`main` es **producción**: cada push a `main` despliega automáticamente en Cloud Run
(`digital-logyser`, us-east1, y `nomina-logyser`, us-central1).

El flujo depende de **dónde** se está trabajando. En los dos casos, al terminar
todo debe quedar en `main`, para que al pasar del PC al celular (o al revés) no
haya cambios a medias.

### A. En el PC de William (carpeta local, Claude en Visual Studio Code)
Se trabaja **directo en `main`**, en la carpeta principal del repositorio.
1. Antes de empezar: `git status`. Si hay cambios sin guardar o la carpeta está en
   otra rama, **avisa a William y no los descartes**. Si está limpia:
   `git checkout main && git pull`.
2. **No crees ramas ni copias aparte (worktrees).** Una sola sesión de IA trabaja en
   la carpeta a la vez.
3. Haz los cambios y explica cómo probarlos localmente:
   `$env:DISABLE_BACKGROUND_JOBS="true"; node app.js` (PowerShell). El `.env` local
   apunta a la **base de datos de producción**, y sin ese interruptor correrían las
   tareas programadas (PDF, correos) contra datos reales.
4. **Solo cuando William confirme que lo probó**, haz commit en `main` y
   `git push origin main` (se despliega a producción en ~10 min).

### B. Desde el celular (Claude en la nube, sin acceso a la carpeta local)
Se trabaja **por ramas**, nunca directo en `main`.
1. Parte del último `main` y crea una rama con el prefijo **`claude/`** (obligatorio),
   por ejemplo `claude/nomina-activos-parametros`.
2. Haz los cambios y los commits en esa rama, y súbela: `git push -u origin claude/<tema>`.
3. Al subir una rama `claude/...`, Cloud Build la despliega sola en el servicio de
   **prueba** `digital-logyser-prueba`:
   https://digital-logyser-prueba-aqckcbqh4q-ue.a.run.app
   (tarda ~10 min; el activador solo escucha ramas que empiezan por `claude/`).
4. Abre un **pull request** hacia `main` explicando qué cambia, y pide a William que
   lo pruebe en la URL de prueba.
5. **Solo cuando William lo confirme**, se fusiona a `main`.

### Sobre la URL de prueba
- Usa la **misma base de datos de producción**: lo que se guarde ahí es real.
- Tiene `DISABLE_BACKGROUND_JOBS=true`: no corren las tareas programadas
  (`setInterval` en `app.js`). Toda tarea programada nueva debe ir dentro del bloque
  que respeta ese interruptor.

## 2. Cambios en la base de datos
- Todo cambio (crear tablas, columnas, filas de `Config_Parametros` o `Maestro_Menu`) va
  en un archivo `.sql` dentro de `migraciones/`, con fecha en el nombre
  (`AAAA-MM-DD_descripcion.sql`) y escrito para poder ejecutarse más de una vez
  (`INSERT ... WHERE NOT EXISTS`, `INSERT IGNORE`, `CREATE TABLE IF NOT EXISTS`).
- La IA ejecuta la migración en la base de datos (ya no se corre desde Cloud Shell), pero
  **solo cuando William lo confirme**, y siempre revisando antes qué hace el archivo.
  La base es la de **producción**: lo que se ejecute es real.
- Si la migración **borra o cambia datos, columnas o tablas** (`DROP`, `DELETE`, `UPDATE`,
  `TRUNCATE`, `ALTER ... DROP`), avísale a William qué se pierde y espera su confirmación
  expresa antes de ejecutarla. Antes de borrar una tabla, guarda una copia de respaldo.
- Después de ejecutarla, verifica el resultado (filas insertadas, comparativo) y cuéntaselo.

## 3. Configuración en tablas, no en el código
- Las reglas de negocio (roles con permiso, destinatarios de correos, cargos,
  operaciones, límites, interruptores) van en **`Config_Parametros`**
  (`Modulo`, `Seccion`, `Concepto`, `Condicion`, `Parametro`, `Descripcion`), no fijas en el código.
  Ejemplos ya implementados: `nomina/Retiros` (`configRetiro.js`),
  `nomina/Traslados` (`configTraslados.js`), `nomina/Cesantias`,
  `talenthub/Requisiciones`, `talenthub/Sociodemografica` (`notificacionIngreso.js`).
- **Toda fila nueva de `Config_Parametros` lleva `Descripcion`**: una frase corta (máx. 500
  caracteres) que explique para qué sirve, qué controla y, si aplica, qué pasa si se deja vacía.
  Inclúyela en el `INSERT` de la migración, por ejemplo:
  `INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)`.
  La columna se creó en `migraciones/2026-10-23_config_parametros_descripcion.sql`.
- Listas separadas por coma; comparación sin distinguir mayúsculas ni tildes.
- Si la fila no existe, el código usa un valor por defecto igual al comportamiento
  anterior, para que nada se rompa antes de ejecutar el SQL.
- Quién ve cada pestaña de Nómina y qué operaciones ve: `Maestro_Menu_Nomina`
  (vía `computarAccesoNomina`). No dupliques listas de roles para eso.
- Grupo de notificación de ingreso de cada cargo: `Config_Cargo_Laboral.Notificar`.

## 4. Correos de notificación
- Destinatarios **por Rol** (Email de `Maestro_Usuarios`), no correos escritos en el código.
- Auxiliar, AuxiliarR, Coordinador y CoordinadorR se resuelven según la Operación del
  trabajador (`resolverResponsablesRetiro` en `configRetiro.js`).
- Quien registra o ejecuta la acción va en copia.
- Encabezado: `encabezadoLogo(color)` con `attachments: [LOGO_HEADER_ATTACHMENT]`
  (azul corporativo `#1B2A5E` = `COLOR_ENCABEZADO_AZUL`).
- En correos internos (que no van al trabajador) se muestra el cargo del trabajador.
- Cada módulo tiene un interruptor `Habilitar notificaciones de correo en ...`.

## 5. Seguridad
- No subas al repositorio contraseñas, `.env`, llaves ni credenciales.
- Hay una revisión de seguridad pendiente para todos los módulos (rutas sin validación
  de usuario, sobre todo en Cesantías). No la mezcles con otros cambios sin que
  William lo pida.

## 6. Idioma
Explica los cambios a William en español, en lenguaje claro.
