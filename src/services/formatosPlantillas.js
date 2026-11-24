const pool = require('./db');
const { seccionesDelRol, normalizar } = require('./maestroMenu');

// ── Cloud Docs › Formatos ───────────────────────────────────────────────────
// Consulta y edición de las plantillas de documentos (Maestro_Plantillas): textos del documento,
// código, versión y fecha del formato y descripción.
// Quién ve la pestaña: Maestro_Menu (Modulo 'clouddocs', Seccion 'Formatos').
// Qué se puede editar y quién: Config_Parametros (Modulo 'CloudDocs', Seccion 'Formatos').
// Cada cambio guarda antes una copia de lo anterior en Historial_Plantillas
// (migraciones/2026-11-23_clouddocs_formatos.sql).

const MODULO_CONFIG = 'CloudDocs';
const SECCION_CONFIG = 'Formatos';
const SECCION_MENU = 'Formatos';

const P = {
  ROLES_EDITAR:   'Roles que pueden editar formatos',
  CAMPOS:         'Campos editables de los formatos',
  ROLES_HTML:     'Roles que pueden editar el código HTML de los formatos',
  MOTIVO:         'Exigir motivo del cambio en formatos',
  SUBIR_VERSION:  'Subir la versión del formato al cambiar el texto',
  OCULTOS:        'Plantillas ocultas en Formatos',
};

// Valores cuando la fila no existe en Config_Parametros
const DEFAULTS = {
  [P.ROLES_EDITAR]:  'Sistema, Calidad',
  [P.CAMPOS]:        'texto, codigo_formato, version_formato, fecha_version, observaciones',
  [P.ROLES_HTML]:    'Sistema',
  [P.MOTIVO]:        '1',
  [P.SUBIR_VERSION]: '0',
  [P.OCULTOS]:       '',
};

// Campos que se pueden habilitar en "Campos editables de los formatos"
const CAMPOS_VALIDOS = ['texto', 'codigo_formato', 'version_formato', 'fecha_version', 'observaciones', 'activo'];

function lista(valor) {
  return String(valor || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function contiene(listaValores, valor) {
  const buscado = normalizar(valor);
  return lista(listaValores).some((v) => normalizar(v) === buscado);
}

function esSi(valor) {
  return ['si', '1', 'true', 'activo', 'habilitado'].includes(normalizar(valor));
}

async function leerParametros() {
  try {
    const [rows] = await pool.execute(
      'SELECT `Concepto`, `Parametro` FROM `Config_Parametros` WHERE `Modulo` = ? AND `Seccion` = ?',
      [MODULO_CONFIG, SECCION_CONFIG]
    );
    const mapa = {};
    rows.forEach((r) => { mapa[String(r.Concepto || '').trim()] = r.Parametro == null ? '' : String(r.Parametro); });
    return mapa;
  } catch (err) {
    console.error('[formatos] No se pudieron leer los parámetros, se usan los valores por defecto:', err.message);
    return {};
  }
}

function valor(params, concepto) {
  return Object.prototype.hasOwnProperty.call(params, concepto) ? params[concepto] : DEFAULTS[concepto];
}

// Usuario y lo que puede hacer en Formatos. null = sin acceso a la pestaña.
async function accesoFormatos(usuarioId) {
  if (!usuarioId) return null;
  const [uRows] = await pool.execute('SELECT ID, Nombre, Rol FROM Maestro_Usuarios WHERE ID = ?', [usuarioId]);
  if (!uRows.length) return null;
  const usuario = uRows[0];
  const rol = usuario.Rol || '';

  const secciones = await seccionesDelRol('clouddocs', rol);
  if (!secciones.some((s) => normalizar(s.seccion) === normalizar(SECCION_MENU))) return null;

  const params = await leerParametros();
  const puedeEditar = contiene(valor(params, P.ROLES_EDITAR), rol);
  const campos = lista(valor(params, P.CAMPOS)).map((c) => c.toLowerCase()).filter((c) => CAMPOS_VALIDOS.includes(c));

  return {
    usuarioId: usuario.ID,
    usuarioNombre: usuario.Nombre || usuario.ID,
    rol,
    puedeEditar,
    campos: puedeEditar ? campos : [],
    puedeEditarHtml: puedeEditar && contiene(valor(params, P.ROLES_HTML), rol),
    exigirMotivo: esSi(valor(params, P.MOTIVO)),
    subirVersion: esSi(valor(params, P.SUBIR_VERSION)),
    ocultos: lista(valor(params, P.OCULTOS)),
  };
}

// ── Textos editables del HTML ───────────────────────────────────────────────
// El HTML se parte en etiquetas y textos sin reconstruirlo: al guardar solo se reemplaza el texto
// cambiado y el resto del documento queda igual, carácter por carácter. No se ofrecen los textos
// de <script>, <style>, <title> ni comentarios, y las variables {{...}} deben quedar iguales.
const RE_TOKEN = /(<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script\s*>|<style\b[\s\S]*?<\/style\s*>|<title\b[\s\S]*?<\/title\s*>|<[^>]*>)/gi;
const RE_VARIABLE = /\{\{[^}]*\}\}/g;

const ENTIDADES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü', ordm: 'º', ordf: 'ª', deg: '°',
  iquest: '¿', iexcl: '¡', laquo: '«', raquo: '»', middot: '·', bull: '•', hellip: '…',
  ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', copy: '©', reg: '®',
  euro: '€', sect: '§', times: '×', check: '✓',
};

// Texto legible de un fragmento HTML; null si trae una entidad que no se sabe leer (no se ofrece).
function decodificar(raw) {
  let desconocida = false;
  const texto = raw.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, ent) => {
    if (ent[0] === '#') {
      const n = ent[1] === 'x' || ent[1] === 'X' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    if (Object.prototype.hasOwnProperty.call(ENTIDADES, ent)) return ENTIDADES[ent];
    desconocida = true;
    return m;
  });
  return desconocida ? null : texto;
}

function codificar(texto) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/ /g, '&nbsp;');
}

// Quita solo espacios, saltos y tabulaciones de los extremos (no los &nbsp;, que son parte del texto)
function recortarEspacios(t) {
  return String(t).replace(/^[ \t\n\r\f]+|[ \t\n\r\f]+$/g, '');
}

function variablesDe(texto) {
  return (String(texto).match(RE_VARIABLE) || []).map((v) => v.replace(/\s+/g, '')).sort();
}

function tokenizar(html) {
  return String(html || '').split(RE_TOKEN);
}

// [{ indice, texto, variables }] de los textos que se pueden editar
function segmentosEditables(html) {
  const tokens = tokenizar(html);
  const segmentos = [];
  tokens.forEach((raw, i) => {
    if (i % 2 === 1 || !raw || !recortarEspacios(raw)) return; // posiciones impares = etiquetas
    const texto = decodificar(recortarEspacios(raw).replace(/\r\n/g, '\n'));
    if (texto == null) return;
    // Solo textos con letras además de las variables (no "{{fecha}}" sola ni signos sueltos)
    if (!/\p{L}/u.test(texto.replace(RE_VARIABLE, ''))) return;
    segmentos.push({ indice: i, texto, variables: variablesDe(texto) });
  });
  return segmentos;
}

// Aplica [{ indice, texto }] sobre el HTML. Lanza error con mensaje claro si algo no cuadra.
function aplicarTextos(html, cambios) {
  const tokens = tokenizar(html);
  const editables = new Map(segmentosEditables(html).map((s) => [s.indice, s]));
  let aplicados = 0;
  (cambios || []).forEach((c) => {
    const indice = Number(c.indice);
    const seg = editables.get(indice);
    if (!seg) throw errorValidacion('Uno de los textos ya no existe en la plantilla. Recarga el formato e inténtalo de nuevo.');
    const nuevo = recortarEspacios(String(c.texto == null ? '' : c.texto).replace(/\r\n/g, '\n'));
    if (nuevo === seg.texto) return;
    if (!nuevo.trim()) throw errorValidacion(`El texto "${recortar(seg.texto)}" no puede quedar vacío.`);
    if (variablesDe(nuevo).join('|') !== seg.variables.join('|')) {
      throw errorValidacion(`En "${recortar(seg.texto)}" las variables deben quedar iguales: ${seg.variables.join(' ') || '(ninguna)'}.`);
    }
    const raw = tokens[indice];
    const inicio = raw.match(/^[ \t\n\r\f]*/)[0];
    const fin = raw.match(/[ \t\n\r\f]*$/)[0];
    tokens[indice] = inicio + codificar(nuevo) + fin;
    aplicados += 1;
  });
  return { html: tokens.join(''), aplicados };
}

function recortar(t) {
  const s = String(t || '').replace(/\s+/g, ' ');
  return s.length > 60 ? `${s.slice(0, 57)}...` : s;
}

function errorValidacion(msg) {
  const e = new Error(msg);
  e.status = 400;
  return e;
}

// Siguiente versión del formato conservando los ceros a la izquierda ('03' → '04', '1' → '2')
function siguienteVersion(v) {
  const s = String(v || '').trim();
  const m = s.match(/^(.*?)(\d+)$/);
  if (!m) return s ? s : '1';
  const n = String(Number(m[2]) + 1).padStart(m[2].length, '0');
  return m[1] + n;
}

function fechaIso(v) {
  if (!v) return '';
  if (v instanceof Date) {
    const p = (n) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  const m = String(v).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

function hoyBogota() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

// ── Nombre del formato ──────────────────────────────────────────────────────
// 1) Documento de Config_Doc_Trabajador si la plantilla está enlazada (id_config_doc) y es la única
//    plantilla de ese documento (ej. los 4 formatos de "Formatos Italcol" comparten Id: se usa su título).
// 2) <title> del diseño, sin la marca final (" — LOG&SER", " - LOG&SER").
// 3) Primer texto del documento (el encabezado del diseño).
// 4) nombre_proceso.
function tituloDelDiseno(html) {
  const m = String(html || '').match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
  if (m) {
    const t = decodificar(m[1].replace(/\s+/g, ' ').trim());
    const limpio = t ? t.replace(/\s+[—–-]\s*LOG\s*&\s*SER.*$/i, '').trim() : '';
    if (limpio) return limpio;
  }
  const seg = segmentosEditables(html)[0];
  return seg ? seg.texto.replace(/\s+/g, ' ').trim() : '';
}

function primeraMayuscula(t) {
  const s = String(t || '');
  // Títulos escritos todo en mayúsculas en el diseño: se dejan en tipo oración para leerlos mejor
  if (s && s === s.toUpperCase() && /\p{L}/u.test(s)) {
    const minus = s.toLocaleLowerCase('es-CO');
    return minus.charAt(0).toLocaleUpperCase('es-CO') + minus.slice(1);
  }
  return s;
}

function nombreFormato(p, usosPorDocumento) {
  if (p.documento && p.id_config_doc != null && (usosPorDocumento[p.id_config_doc] || 0) <= 1) {
    return { nombre: String(p.documento).trim(), origen: 'Config_Doc_Trabajador' };
  }
  const t = tituloDelDiseno(p.contenido_html);
  if (t) return { nombre: primeraMayuscula(t).slice(0, 150), origen: 'diseño' };
  return { nombre: p.nombre_proceso, origen: 'proceso' };
}

async function usosPorDocumento() {
  const [rows] = await pool.execute(
    'SELECT id_config_doc, COUNT(*) AS n FROM Maestro_Plantillas WHERE id_config_doc IS NOT NULL GROUP BY id_config_doc'
  );
  const mapa = {};
  rows.forEach((r) => { mapa[r.id_config_doc] = Number(r.n); });
  return mapa;
}

// ── Consultas ───────────────────────────────────────────────────────────────

async function listarFormatos(acceso) {
  const [rows] = await pool.execute(
    `SELECT p.id_plantilla, p.nombre_proceso, p.id_config_doc, p.observaciones, p.codigo_formato, p.version_formato,
            p.fecha_version, p.tabla_datos, p.requiere_firma_trabajador, p.activo, p.version, p.ultima_actualizacion,
            p.contenido_html, d.Documento AS documento
       FROM Maestro_Plantillas p
       LEFT JOIN Config_Doc_Trabajador d ON d.Id = p.id_config_doc
      ORDER BY p.nombre_proceso`
  );
  const usos = {};
  rows.forEach((r) => { if (r.id_config_doc != null) usos[r.id_config_doc] = (usos[r.id_config_doc] || 0) + 1; });
  return rows
    .filter((r) => !contiene(acceso.ocultos.join(','), r.nombre_proceso))
    .map((r) => {
      const { contenido_html, ...resto } = r;
      const n = nombreFormato(r, usos);
      return { ...resto, nombre: n.nombre, nombre_origen: n.origen, fecha_version: fechaIso(r.fecha_version) };
    });
}

async function obtenerFormato(acceso, id) {
  const [rows] = await pool.execute(
    `SELECT p.*, d.Documento AS documento
       FROM Maestro_Plantillas p
       LEFT JOIN Config_Doc_Trabajador d ON d.Id = p.id_config_doc
      WHERE p.id_plantilla = ?`,
    [id]
  );
  if (!rows.length || contiene(acceso.ocultos.join(','), rows[0].nombre_proceso)) return null;
  const p = rows[0];
  const n = nombreFormato(p, await usosPorDocumento());
  return {
    id_plantilla: p.id_plantilla,
    nombre: n.nombre,
    nombre_origen: n.origen,
    documento: p.documento,
    nombre_proceso: p.nombre_proceso,
    observaciones: p.observaciones,
    codigo_formato: p.codigo_formato,
    version_formato: p.version_formato,
    fecha_version: fechaIso(p.fecha_version),
    activo: p.activo,
    version: p.version,
    ultima_actualizacion: p.ultima_actualizacion,
    contenido_html: p.contenido_html,
    segmentos: segmentosEditables(p.contenido_html),
  };
}

async function historialFormato(id) {
  const [rows] = await pool.execute(
    `SELECT id, fecha, usuario, rol, motivo, cambios, version_anterior
       FROM Historial_Plantillas WHERE id_plantilla = ? ORDER BY id DESC LIMIT 50`,
    [id]
  );
  return rows;
}

// ── Guardar ─────────────────────────────────────────────────────────────────
// datos: { version, motivo, textos: [{indice, texto}], contenido_html, forzarVariables,
//          codigo_formato, version_formato, fecha_version, observaciones, activo }
async function guardarFormato(acceso, id, datos) {
  if (!acceso.puedeEditar) {
    const e = new Error('Tu rol puede ver los formatos pero no editarlos.');
    e.status = 403;
    throw e;
  }
  const motivo = String(datos.motivo || '').trim().slice(0, 500);
  if (acceso.exigirMotivo && !motivo) throw errorValidacion('Escribe el motivo del cambio.');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT * FROM Maestro_Plantillas WHERE id_plantilla = ? FOR UPDATE', [id]);
    if (!rows.length || contiene(acceso.ocultos.join(','), rows[0].nombre_proceso)) {
      const e = new Error('Formato no encontrado.');
      e.status = 404;
      throw e;
    }
    const actual = rows[0];
    if (datos.version != null && Number(datos.version) !== Number(actual.version)) {
      const e = new Error('Otra persona guardó cambios en este formato mientras lo editabas. Recárgalo para ver la versión actual.');
      e.status = 409;
      throw e;
    }

    const set = {};
    const cambios = [];
    const anteriores = {};
    const puede = (campo) => acceso.campos.includes(campo);

    // Contenido: código HTML completo (solo roles de "editar el código HTML") o textos sueltos
    let html = actual.contenido_html;
    if (datos.contenido_html != null && String(datos.contenido_html) !== actual.contenido_html) {
      if (!acceso.puedeEditarHtml) throw errorValidacion('Tu rol no puede editar el código HTML de los formatos.');
      const nuevo = String(datos.contenido_html);
      if (!nuevo.trim()) throw errorValidacion('El código HTML no puede quedar vacío.');
      const antes = new Set(variablesDe(actual.contenido_html));
      const despues = new Set(variablesDe(nuevo));
      const faltan = [...antes].filter((v) => !despues.has(v));
      if (faltan.length && !datos.forzarVariables) {
        const e = errorValidacion(`El código nuevo quita estas variables: ${faltan.join(' ')}. Confirma si de verdad quieres quitarlas.`);
        e.faltanVariables = faltan;
        throw e;
      }
      html = nuevo;
      cambios.push('Código HTML');
    } else if (Array.isArray(datos.textos) && datos.textos.length) {
      if (!puede('texto')) throw errorValidacion('Los textos de los formatos no están habilitados para editar.');
      const r = aplicarTextos(actual.contenido_html, datos.textos);
      if (r.aplicados) {
        html = r.html;
        cambios.push(`Texto (${r.aplicados} ${r.aplicados === 1 ? 'fragmento' : 'fragmentos'})`);
      }
    }
    const contenidoCambio = html !== actual.contenido_html;
    if (contenidoCambio) set.contenido_html = html;

    const campoTexto = (campo, max, etiqueta) => {
      if (datos[campo] === undefined) return;
      const v = datos[campo] == null ? '' : String(datos[campo]).trim();
      const antes = actual[campo] == null ? '' : String(actual[campo]);
      if (v === antes) return;
      if (!puede(campo)) throw errorValidacion(`El campo ${etiqueta} no está habilitado para editar.`);
      if (v.length > max) throw errorValidacion(`${etiqueta}: máximo ${max} caracteres.`);
      set[campo] = v || null;
      anteriores[campo] = actual[campo];
      cambios.push(`${etiqueta}: "${antes || '—'}" → "${v || '—'}"`);
    };
    campoTexto('codigo_formato', 30, 'Código');
    campoTexto('version_formato', 10, 'Versión');
    campoTexto('observaciones', 200, 'Descripción');

    if (datos.fecha_version !== undefined) {
      const v = datos.fecha_version ? String(datos.fecha_version).trim() : '';
      const antes = fechaIso(actual.fecha_version);
      if (v !== antes) {
        if (!puede('fecha_version')) throw errorValidacion('El campo Fecha no está habilitado para editar.');
        if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw errorValidacion('La fecha debe tener el formato AAAA-MM-DD.');
        set.fecha_version = v || null;
        anteriores.fecha_version = antes || null;
        cambios.push(`Fecha: "${antes || '—'}" → "${v || '—'}"`);
      }
    }

    if (datos.activo !== undefined) {
      const v = Number(datos.activo) ? 1 : 0;
      if (v !== Number(actual.activo)) {
        if (!puede('activo')) throw errorValidacion('El campo Activo no está habilitado para editar.');
        set.activo = v;
        anteriores.activo = actual.activo;
        cambios.push(`Activo: ${Number(actual.activo) ? 'Sí' : 'No'} → ${v ? 'Sí' : 'No'}`);
      }
    }

    // "Subir la versión del formato al cambiar el texto": si cambió el contenido y no se tocó la versión
    if (contenidoCambio && acceso.subirVersion && set.version_formato === undefined) {
      const nueva = siguienteVersion(actual.version_formato);
      set.version_formato = nueva;
      anteriores.version_formato = actual.version_formato;
      cambios.push(`Versión (automática): "${actual.version_formato || '—'}" → "${nueva}"`);
      if (set.fecha_version === undefined) {
        set.fecha_version = hoyBogota();
        anteriores.fecha_version = fechaIso(actual.fecha_version) || null;
        cambios.push(`Fecha (automática): "${fechaIso(actual.fecha_version) || '—'}" → "${set.fecha_version}"`);
      }
    }

    if (!Object.keys(set).length) {
      await conn.rollback();
      return { ok: true, sinCambios: true };
    }

    // Copia de respaldo de lo anterior antes de cambiar
    await conn.execute(
      `INSERT INTO Historial_Plantillas
         (id_plantilla, nombre_proceso, usuario, rol, motivo, cambios, version_anterior, valores_anteriores, contenido_html_anterior)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        actual.id_plantilla, actual.nombre_proceso, String(acceso.usuarioId), acceso.rol, motivo || null,
        cambios.join('; ').slice(0, 4000), actual.version, JSON.stringify(anteriores),
        contenidoCambio ? actual.contenido_html : null,
      ]
    );

    const columnas = Object.keys(set);
    const sql = `UPDATE Maestro_Plantillas SET ${columnas.map((c) => `\`${c}\` = ?`).join(', ')},
                 ultima_actualizacion = NOW()${contenidoCambio ? ', version = version + 1' : ''}
                 WHERE id_plantilla = ?`;
    await conn.execute(sql, [...columnas.map((c) => set[c]), actual.id_plantilla]);
    await conn.commit();
    return { ok: true, cambios };
  } catch (err) {
    try { await conn.rollback(); } catch (_) { /* sin transacción abierta */ }
    if (err && err.code === 'ER_NO_SUCH_TABLE') {
      const e = new Error('Falta la tabla de respaldo Historial_Plantillas: ejecuta la migración 2026-11-23_clouddocs_formatos.sql.');
      e.status = 500;
      throw e;
    }
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  accesoFormatos,
  listarFormatos,
  obtenerFormato,
  historialFormato,
  guardarFormato,
  // para pruebas
  segmentosEditables,
  aplicarTextos,
  siguienteVersion,
  tituloDelDiseno,
  DEFAULTS,
  P,
};
