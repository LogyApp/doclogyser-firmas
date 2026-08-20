# Walkthrough - LogySign & DescuentoNomina Módulo Completo

We have successfully implemented the requested modifications for the `logysign`/`registrologysign` flow and built the new `descuentonomina` module from scratch.

---

## 1. registrologysign Updates
- **WhatsApp Action in Table:** Added a direct "WhatsApp" button in the "Acciones" column of the main log table for all pending (`PENDIENTE`) signature records. It generates the message with the direct signing link and handles prepending the `57` international country code to the worker's cell phone number.

---

## 2. Nuevo Módulo descuentonomina
We created the new module copying the robust logic of `pruebaconsumo` but tailored for payroll discount authorization:

- **Database Schema (`Dynamic_descuentonomina`):** Created the new SQL table containing all metadata (id_descuento, fecha, identificacion, nombre_trabajador, cargo, ciudad, tipo_descuento, cuotas, valor, motivo, observaciones, tokens, etc.) with corresponding optimization indexes.
- **Templates Configuration (`Maestro_Plantillas`):** Created and configured two HTML/CSS templates dynamically resolving depending on the discount type:
  - `descuento_anticipado` (Anticipada): A general pre-signed layout without specific amounts.
  - `descuento_especifico` (Específica): A structured layout detailing Cuotas, Valor, and Motivo.
  - Added corporate logo `logo.png` to both headers and worker's cargo inside document body.
- **Backend Controller (`src/routes/descuentonomina.js`):**
  - Configured REST endpoints (`/api/pruebas`, `/api/conteos-filtros`, `/api/crear`, `/api/crear-masivo`, `/api/firmar-asistente`, `/api/actualizar-contacto`, `/api/eliminar`).
  - Restricts authorization to roles: `['Contratación', 'Archivo', 'Asistencial', 'Sistema']`.
  - Integrates storage uploads to `talenthub_central` using format: `[Identificación]/[Identificación].DCTO.[yyyymmddhhss].pdf`.
  - Saves file records to `Maestro_docTrabajador` under `TipoDocumento = 21` and `Prefijo = 'DCTO'`.
- **Views Implementation:**
  - **Listing (`descuentonomina/index.html`):** Renders table log, filters count, and detail side panel.
  - **Form (`formdescuentonomina/form.html`):** Renders autocomplete worker list, dropdown for `TipoDescuento` (Anticipada / Específica), and shows/hides Cuotas, Valor, Motivo fields conditionally.
  - **Signing (`descuentonomina/firmar.html`):** Worker signature pad with dynamic preview loading template content depending on the discount type.

---

## 3. Últimos Ajustes y Nuevos Permisos de Seguridad
1. **Columna de Documento PDF:**
   - Se adicionó la columna **"Documento"** en la tabla principal de resultados ([index.html](file:///c:/Users/Admin/OneDrive/Documentos/GitHub/doclogyser-firmas/src/views/descuentonomina/index.html)) mostrando un enlace interactivo `📄 PDF` para abrir el documento firmado directamente en una nueva pestaña (haciendo `event.stopPropagation()` para no colisionar con la apertura del detalle lateral).
2. **Correos de Notificación de Firma Dinámicos:**
   - Modificada la función `notificarDescuentoNominaFirmada` en ([email.js](file:///c:/Users/Admin/OneDrive/Documentos/GitHub/doclogyser-firmas/src/services/email.js)) para enrutar según el tipo de descuento:
     - **Específico:** Destinatario `nomina@logyser.com`, con copia a `gestor.nomina@logyser.com`, `admin@logyser.com` y el correo del usuario creador.
     - **Anticipada:** Destinatario `contratacionnacional@logyser.com`, con copia a `admin@logyser.com` y `gestiondocumental@logyser.com`.
3. **Control de Permisos por Rol:**
   - Si el usuario logueado posee rol de **Contratación**, **Archivo** o **Asistencial**:
     - **Listado y Filtros:** Se restringe la consulta tanto en el listado (`/api/pruebas`) como en el conteo de filtros (`/api/conteos-filtros`) para retornar únicamente registros donde `tipo_descuento = 'Anticipada'`.
     - **Formulario:** El campo **Tipo de Descuento** se autoselecciona por defecto en `"Anticipada (General)"` y se encuentra **deshabilitado (bloqueado)** para evitar cualquier cambio manual.
     - **Detalle Individual:** Si intenta consultar un ID de tipo `Específica` mediante API, el backend responde con `403 Forbidden`.
   - Si el rol es diferente y no es **Sistema** (cualquier otro rol):
     - El formulario autoselecciona `"Específica"` y lo bloquea.
   - Si el rol es **Sistema**:
     - Puede ver ambos tipos de descuento y el selector del formulario permanece desbloqueado.
4. **Filtros con Conteo Dinámico:**
   - Los dropdowns de Regional y Operación en el listado se cargan dinámicamente mostrando el número total de registros asociados entre paréntesis, p.ej. `Regional (12)`.
5. **Alineación de Permisos Regionales/Operación con Módulo Traslados:**
   - Se reestructuraron las listas y variables de control en `descuentonomina.js` para adoptar el modelo completo de traslados:
     - `Sistema`, `Control` y `Nomina` -> Visualizan todo a nivel nacional.
     - `Contratación`, `Archivo` y `Asistencial` -> Visualizan todo a nivel nacional, pero restringidos únicamente a tipo de documento `"Anticipada"`.
     - `AuxiliarR` y `CoordinadorR` -> Restringidos a operaciones pertenecientes a su regional asignada.
     - `Auxiliar` y `Coordinador` -> Restringidos a operaciones asociadas a su dispositivo sociodemográfico (`Dispositivo`).
     - Cualquier otro rol -> Restringidos únicamente a su operación directa asignada.
