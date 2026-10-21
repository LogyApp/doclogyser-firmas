# Instrucciones para asistentes de IA — doclogyser-firmas

Estas reglas aplican a cualquier asistente de IA que trabaje en este repositorio
(Claude en Visual Studio Code, Claude web, u otros). Léelas antes de cambiar código.

## 1. Flujo de trabajo obligatorio (nunca directo a producción)

`main` es **producción**: cada push a `main` despliega automáticamente en Cloud Run
(`digital-logyser`, us-east1, y `nomina-logyser`, us-central1).

1. **No edites ni hagas commit directamente en `main`.** No hagas `git push` a `main`.
2. Antes de empezar: `git checkout main && git pull`, y crea una rama nueva con el
   prefijo **`claude/`** (obligatorio), por ejemplo `claude/nomina-activos-parametros`.
3. Haz los cambios y los commits en esa rama, y súbela: `git push -u origin claude/<tema>`.
4. Al subir una rama `claude/...`, Cloud Build la despliega sola en el servicio de
   **prueba** `digital-logyser-prueba`:
   https://digital-logyser-prueba-aqckcbqh4q-ue.a.run.app
   (tarda ~10 min; el activador solo escucha ramas que empiezan por `claude/`).
5. Abre un **pull request** hacia `main` explicando qué cambia, y pide a William que
   lo pruebe en la URL de prueba.
6. **Solo cuando William lo confirme**, se fusiona a `main`.

Puedes ejecutar la app en local para probar, pero lo que se entrega siempre va por
rama `claude/...` → URL de prueba → pull request → confirmación → `main`.

### Sobre la URL de prueba
- Usa la **misma base de datos de producción**: lo que se guarde ahí es real.
- Tiene `DISABLE_BACKGROUND_JOBS=true`: no corren las tareas programadas
  (`setInterval` en `app.js`). Toda tarea programada nueva debe ir dentro del bloque
  que respeta ese interruptor.

## 2. Cambios en la base de datos
- **No ejecutes cambios contra la base de datos de producción.**
- Todo cambio (crear tablas, columnas, filas de `Config_Parametros`) va en un archivo
  `.sql` dentro de `migraciones/`, con fecha en el nombre
  (`AAAA-MM-DD_descripcion.sql`) y escrito para poder ejecutarse más de una vez
  (`INSERT ... WHERE NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`).
- William ejecuta el SQL desde Cloud Shell.

## 3. Configuración en tablas, no en el código
- Las reglas de negocio (roles con permiso, destinatarios de correos, cargos,
  operaciones, límites, interruptores) van en **`Config_Parametros`**
  (`Modulo`, `Seccion`, `Concepto`, `Condicion`, `Parametro`), no fijas en el código.
  Ejemplos ya implementados: `nomina/Retiros` (`configRetiro.js`),
  `nomina/Traslados` (`configTraslados.js`), `nomina/Cesantias`,
  `talenthub/Requisiciones`, `talenthub/Sociodemografica` (`notificacionIngreso.js`).
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
