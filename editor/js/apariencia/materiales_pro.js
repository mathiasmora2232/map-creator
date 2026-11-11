/* Editor del mapa (2.1, Map Editor Pro fase 4): biblioteca de materiales.
   Amplía materiales.js (pestaña «Material» y colección «materiales»):
   - Presets (§4.2 y §12): hormigón nuevo y envejecido, cemento pulido, asfalto y asfalto deteriorado, adoquín, baldosa, cerámica,
     porcelanato, madera clara y oscura, parqué, piedra, mármol, tierra, arena, césped, grava, pavimento industrial, suelo metálico,
     rejilla, antideslizante, metal oxidado, acero galvanizado, pintura industrial, hormigón pintado, pared blanca, ladrillo, bloque,
     chapa ondulada y tejas rojas. La textura se dibuja en un lienzo (texturas_proc.js) con su normal map; si el material tiene una
     textura importada se usa esa.
   - Mapeo «mundo» (triplanar): la textura se repite cada `escala` metros en cualquier pieza (cajas, cilindros, pisos, cubiertas,
     escaleras) sin estirarse con el tamaño del objeto. Rotación UV, rugosidad, metal, opacidad, relieve (normal map), suciedad y desgaste.
   - Un preset asignado crea (una vez) el material compartido «preset-<clave>»: todas las piezas que lo usan comparten el recurso.
     Editar un material: «todas las instancias» (cambia el recurso) o «solo la selección» (copia local asignada a lo elegido).
   - Pintar una selección no toca otras superficies que compartan el material original (solo cambia props.material de lo elegido).
   - Reemplazo masivo (en todo el mapa o en la selección) y «seleccionar todo lo que usa este material».
   Campos nuevos de un material (todos opcionales, compatibles con los de antes): preset, patron, mapeo ('mundo' | 'cara'), escala
   (metros por repetición), rotacionUV (grados), relieve (0-3), normal (asset de textura), suciedad, desgaste (0-1), semilla. */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E || !E.api || !window.OOMateriales || !window.OOTexturas) return;
  const A = E.api, T = A.THREE, esc = A.esc, svg = A.svg, $ = s => document.querySelector(s);
  const TX = window.OOTexturas;

  /* ---------- presets ---------- */
  const G_SUELO = 'Suelos y pavimentos', G_PIEDRA = 'Hormigón, piedra y cerámica', G_MADERA = 'Madera', G_EXT = 'Exterior y naturaleza', G_MET = 'Metales e industrial', G_PARED = 'Paredes y cubiertas';
  const PRESETS = {
    hormigon_nuevo: { n: 'Hormigón nuevo', g: G_PIEDRA, patron: 'hormigon', color: '#bfbbb2', rugosidad: 0.88, escala: 2 },
    hormigon_envejecido: { n: 'Hormigón envejecido', g: G_PIEDRA, patron: 'hormigon', color: '#a39e92', rugosidad: 0.95, escala: 2, suciedad: 0.65, desgaste: 0.55 },
    hormigon_pintado: { n: 'Hormigón pintado', g: G_PIEDRA, patron: 'hormigon', color: '#8fa3b5', rugosidad: 0.7, escala: 2, desgaste: 0.15 },
    cemento_pulido: { n: 'Cemento pulido', g: G_SUELO, patron: 'pulido', color: '#b3b0a9', rugosidad: 0.32, escala: 3 },
    asfalto: { n: 'Asfalto', g: G_SUELO, patron: 'asfalto', color: '#4b4e52', rugosidad: 0.95, escala: 2 },
    asfalto_deteriorado: { n: 'Asfalto deteriorado', g: G_SUELO, patron: 'asfalto', color: '#55575a', rugosidad: 0.97, escala: 2.5, suciedad: 0.35, desgaste: 0.8 },
    adoquin: { n: 'Adoquín', g: G_SUELO, patron: 'adoquin', color: '#9e8e7d', rugosidad: 0.85, escala: 0.8, relieve: 1.4 },
    baldosa: { n: 'Baldosa', g: G_SUELO, patron: 'baldosa', color: '#d8d2c4', rugosidad: 0.55, escala: 1.2 },
    ceramica: { n: 'Cerámica', g: G_PIEDRA, patron: 'ceramica', color: '#ebe6dc', rugosidad: 0.25, escala: 1.2 },
    porcelanato: { n: 'Porcelanato', g: G_PIEDRA, patron: 'porcelanato', color: '#d9d3c9', rugosidad: 0.2, escala: 1.2 },
    madera_clara: { n: 'Madera clara', g: G_MADERA, patron: 'madera', color: '#c9a273', rugosidad: 0.6, escala: 1 },
    madera_oscura: { n: 'Madera oscura', g: G_MADERA, patron: 'madera', color: '#6b4a2f', rugosidad: 0.55, escala: 1 },
    parque: { n: 'Parqué', g: G_MADERA, patron: 'parque', color: '#a97b4d', rugosidad: 0.45, escala: 1 },
    piedra: { n: 'Piedra', g: G_PIEDRA, patron: 'piedra', color: '#8f8a80', rugosidad: 0.9, escala: 2, relieve: 1.6 },
    marmol: { n: 'Mármol', g: G_PIEDRA, patron: 'marmol', color: '#e8e5df', rugosidad: 0.15, escala: 2 },
    tierra: { n: 'Tierra', g: G_EXT, patron: 'tierra', color: '#8a6e50', rugosidad: 1, escala: 3 },
    arena: { n: 'Arena', g: G_EXT, patron: 'arena', color: '#d4bf92', rugosidad: 1, escala: 3 },
    cesped: { n: 'Césped', g: G_EXT, patron: 'cesped', color: '#5f8c3e', rugosidad: 1, escala: 1.5 },
    grava: { n: 'Grava', g: G_EXT, patron: 'grava', color: '#9a958d', rugosidad: 0.95, escala: 1, relieve: 1.6 },
    pavimento_industrial: { n: 'Pavimento industrial', g: G_SUELO, patron: 'industrial', color: '#a9a69e', rugosidad: 0.7, escala: 6, suciedad: 0.25 },
    suelo_metalico: { n: 'Suelo metálico (chapa estriada)', g: G_MET, patron: 'diamante', color: '#9ca3a9', rugosidad: 0.45, metal: 0.85, escala: 0.6, relieve: 1.5 },
    rejilla: { n: 'Rejilla metálica', g: G_MET, patron: 'rejilla', color: '#6e7479', rugosidad: 0.5, metal: 0.8, escala: 0.5 },
    antideslizante: { n: 'Superficie antideslizante', g: G_SUELO, patron: 'antideslizante', color: '#3c3e41', rugosidad: 0.9, escala: 0.5 },
    metal_oxidado: { n: 'Metal oxidado', g: G_MET, patron: 'oxido', color: '#8a4b26', rugosidad: 0.85, metal: 0.45, escala: 1.5 },
    acero_galvanizado: { n: 'Acero galvanizado', g: G_MET, patron: 'galvanizado', color: '#b6bcc1', rugosidad: 0.38, metal: 0.9, escala: 1 },
    pintura_industrial: { n: 'Pintura industrial', g: G_MET, patron: 'pintura', color: '#e0b81a', rugosidad: 0.45, metal: 0.1, escala: 1 },
    pared_blanca: { n: 'Pared blanca', g: G_PARED, patron: 'enlucido', color: '#f0eee7', rugosidad: 0.92, escala: 2 },
    ladrillo: { n: 'Ladrillo', g: G_PARED, patron: 'ladrillo', color: '#a5553a', rugosidad: 0.9, escala: 1, relieve: 1.3 },
    bloque: { n: 'Bloque de hormigón', g: G_PARED, patron: 'bloque', color: '#cfccc4', rugosidad: 0.9, escala: 1 },
    chapa_ondulada: { n: 'Chapa ondulada', g: G_PARED, patron: 'chapa', color: '#9aa3ab', rugosidad: 0.45, metal: 0.7, escala: 1 },
    tejas_rojas: { n: 'Tejas rojas', g: G_PARED, patron: 'tejas', color: '#b24a2c', rugosidad: 0.75, escala: 1.2, relieve: 1.4 }
  };
  const GRUPOS = [G_SUELO, G_PIEDRA, G_MADERA, G_EXT, G_MET, G_PARED];
  const PATRON_CAT = { bloque: 'bloque', ladrillo: 'ladrillo', chapa: 'chapa', concreto: 'hormigon', adoquin: 'adoquin', asfalto: 'asfalto', baldosa: 'baldosa', cesped: 'cesped', tierra: 'tierra', madera: 'madera', metal: 'galvanizado', pintura: 'enlucido', vidrio: 'liso' };

  /* ---------- texturas (lienzos con caché) ---------- */
  const cacheTex = new Map();
  function texturasDe(patron, m) {
    const tam = Math.max(64, Math.min(1024, +m.tamTextura || 512));
    const k = [patron, m.color, (+m.suciedad || 0).toFixed(2), (+m.desgaste || 0).toFixed(2), m.semilla | 0, tam].join('|');
    let t = cacheTex.get(k); if (t) { cacheTex.delete(k); cacheTex.set(k, t); return t; }
    const lz = TX.lienzos(patron, { color: m.color, tam, suciedad: m.suciedad, desgaste: m.desgaste, semilla: m.semilla || 1, relieve: 1 });
    const map = new T.CanvasTexture(lz.color); map.wrapS = map.wrapT = T.RepeatWrapping; map.encoding = T.sRGBEncoding; map.anisotropy = 8; map.name = 'oo_' + patron;
    const normal = lz.normal ? new T.CanvasTexture(lz.normal) : null; if (normal) { normal.wrapS = normal.wrapT = T.RepeatWrapping; normal.anisotropy = 8; }
    t = { map, normal, alfa: lz.alfa, lienzo: lz.color }; cacheTex.set(k, t);
    while (cacheTex.size > 48) { const [k0, t0] = cacheTex.entries().next().value; cacheTex.delete(k0); t0.map.dispose(); if (t0.normal) t0.normal.dispose(); }
    return t;
  }
  const texLoader = new T.TextureLoader(), texAssets = new Map();
  function texAsset(id, srgb) {
    const d = A.efectivos('assets').get(id); if (!d) return null; const k = id + (srgb ? '|s' : '|l'); if (texAssets.has(k)) return texAssets.get(k);
    const t = texLoader.load(d.url || ('/_blob/' + d.archivo), () => { A.marcar(); }); t.wrapS = t.wrapT = T.RepeatWrapping; if (srgb) t.encoding = T.sRGBEncoding; t.anisotropy = 8; texAssets.set(k, t); return t;
  }
  /* miniaturas pequeñas de un patrón (biblioteca) */
  const minis = new Map();
  function mini(m) {
    if (!m) return ''; const patron = patronDe(m); if (!patron && !m.textura) return '';
    if (!patron) { const d = A.efectivos('assets').get(m.textura); return (d && d.mini) || ''; }
    const k = [patron, m.color, (+m.suciedad || 0).toFixed(2), (+m.desgaste || 0).toFixed(2), m.semilla | 0].join('|'); if (minis.has(k)) return minis.get(k);
    const lz = TX.lienzos(patron, { color: m.color, tam: 72, suciedad: m.suciedad, desgaste: m.desgaste, semilla: m.semilla || 1, normal: false });
    let url = ''; try { url = lz.color.toDataURL('image/png'); } catch (e) { /* lienzo bloqueado */ } minis.set(k, url); return url;
  }
  const patronDe = m => m && !m.textura ? (m.patron || (PRESETS[m.preset] || {}).patron || null) : null;
  const esPro = m => !!(m && (m.preset || m.patron || m.mapeo === 'mundo' || m.normal));

  /* ---------- mapeo triplanar (coordenadas del mundo) ---------- */
  const VARY = '\nvarying vec3 vOOPos;\nvarying vec3 vOONor;\n';
  const FUNC = `${VARY}uniform float ooEscala;\nuniform vec2 ooRot;\nvec2 ooUV(vec2 p) { p = p / max(ooEscala, 1e-3); return vec2(p.x * ooRot.x - p.y * ooRot.y, p.x * ooRot.y + p.y * ooRot.x); }\nvec3 ooPesos() { vec3 b = pow(abs(normalize(vOONor)), vec3(4.0)); return b / (b.x + b.y + b.z + 1e-5); }\n`;
  function triplanar(mt, escala, rotGrados) {
    const r = (+rotGrados || 0) * Math.PI / 180;
    const u = { ooEscala: { value: Math.max(0.01, +escala || 1) }, ooRot: { value: new T.Vector2(Math.cos(r), Math.sin(r)) } };
    mt.userData.ooU = u;
    mt.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>' + VARY).replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
  vec4 ooW = vec4(transformed, 1.0); vec3 ooN = objectNormal;
  #ifdef USE_INSTANCING
    ooW = instanceMatrix * ooW; ooN = mat3(instanceMatrix) * ooN;
  #endif
  ooW = modelMatrix * ooW; vOOPos = ooW.xyz; vOONor = normalize(mat3(modelMatrix) * ooN);`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>' + FUNC).replace('#include <map_fragment>', `#ifdef USE_MAP
  vec3 ooB = ooPesos(); vec2 ooX = ooUV(vec2(vOOPos.z, vOOPos.y)), ooY = ooUV(vec2(vOOPos.x, -vOOPos.z)), ooZ = ooUV(vec2(vOOPos.x, vOOPos.y));
  diffuseColor *= texture2D(map, ooX) * ooB.x + texture2D(map, ooY) * ooB.y + texture2D(map, ooZ) * ooB.z;
#endif`).replace('#include <normal_fragment_maps>', `#ifdef USE_NORMALMAP
  vec3 ooB2 = ooPesos(); vec3 ooNw = normalize(vOONor);
  vec2 ooX2 = ooUV(vec2(vOOPos.z, vOOPos.y)), ooY2 = ooUV(vec2(vOOPos.x, -vOOPos.z)), ooZ2 = ooUV(vec2(vOOPos.x, vOOPos.y));
  vec3 tX = texture2D(normalMap, ooX2).xyz * 2.0 - 1.0, tY = texture2D(normalMap, ooY2).xyz * 2.0 - 1.0, tZ = texture2D(normalMap, ooZ2).xyz * 2.0 - 1.0;
  tX.xy *= normalScale; tY.xy *= normalScale; tZ.xy *= normalScale;
  tX = vec3(tX.xy + ooNw.zy, abs(tX.z) * ooNw.x); tY = vec3(tY.xy + ooNw.xz, abs(tY.z) * ooNw.y); tZ = vec3(tZ.xy + ooNw.xy, abs(tZ.z) * ooNw.z);
  vec3 ooNm = normalize(tX.zyx * ooB2.x + tY.xzy * ooB2.y + tZ.xyz * ooB2.z);
  normal = normalize((viewMatrix * vec4(ooNm, 0.0)).xyz) * faceDirection;
#endif`);
    };
    mt.customProgramCacheKey = () => 'oo-triplanar-1';
    mt.needsUpdate = true;
  }
  /* materiales.js llama a esto al construir cada material propio */
  function extender(mt, m) {
    if (!esPro(m)) return mt;
    const patron = patronDe(m);
    if (patron) { const t = texturasDe(patron, m); mt.map = t.map; mt.color.set('#ffffff'); if (t.normal && (m.relieve == null || +m.relieve > 0)) { mt.normalMap = t.normal; const r = m.relieve == null ? 1 : +m.relieve; mt.normalScale.set(r, r); } if (t.alfa) { mt.alphaTest = 0.5; mt.transparent = (+m.opacidad || 1) < 1; mt.side = T.DoubleSide; } }
    else if (m.textura) { const t = texAsset(m.textura, true); if (t) mt.map = t; }
    if (m.normal) { const n = texAsset(m.normal, false); if (n) { mt.normalMap = n; const r = m.relieve == null ? 1 : +m.relieve; mt.normalScale.set(r, r); } }
    if (m.mapeo !== 'cara') triplanar(mt, m.escala || (PRESETS[m.preset] || {}).escala || 1, m.rotacionUV);
    else if (mt.map) { mt.map = mt.map.clone(); mt.map.needsUpdate = true; const rep = Math.max(0.05, +m.escalaUV || 1); mt.map.repeat.set(rep, rep); mt.map.rotation = (+m.rotacionUV || 0) * Math.PI / 180; }
    return mt;
  }
  /* material sin guardar (vista previa del editor): mismo camino que materiales.js */
  function construirMaterial(m) {
    const op = m.opacidad == null ? 1 : +m.opacidad;
    const mt = new T.MeshStandardMaterial({ color: m.color || '#cccccc', roughness: m.rugosidad == null ? 0.8 : +m.rugosidad, metalness: +m.metal || 0, transparent: op < 1, opacity: op, depthWrite: op >= 0.98 });
    if (m.emision && +m.emisionInt > 0) { mt.emissive = new T.Color(m.emision); mt.emissiveIntensity = +m.emisionInt; }
    if (m.textura && !esPro(m)) { const t = texAsset(m.textura, true); if (t) { mt.map = t.clone(); mt.map.needsUpdate = true; mt.map.repeat.set(+m.escalaUV || 1, +m.escalaUV || 1); } }
    return extender(mt, m);
  }

  /* ---------- documentos de material ---------- */
  const mats = () => A.efectivos('materiales');
  function docPreset(clave, extra) {
    const p = PRESETS[clave]; return Object.assign({ nombre: p.n, preset: clave, patron: p.patron, mapeo: 'mundo', color: p.color, rugosidad: p.rugosidad == null ? 0.8 : p.rugosidad, metal: p.metal || 0, opacidad: 1, escala: p.escala || 1, rotacionUV: 0, relieve: p.relieve == null ? 1 : p.relieve, suciedad: p.suciedad || 0, desgaste: p.desgaste || 0, emision: '#000000', emisionInt: 0, semilla: 1, creado: A.ahora(), actualizado: A.ahora() }, extra || {});
  }
  /* material compartido de un preset (se crea la primera vez) → «u:preset-<clave>» */
  function idPreset(clave) { if (!PRESETS[clave]) return null; const id = 'preset-' + clave; if (!mats().get(id)) A.guardarCol('materiales', id, docPreset(clave)); return id; }
  function claveDestino(k) { if (!k) return null; if (k.startsWith('preset:')) { const id = idPreset(k.slice(7)); return id ? 'u:' + id : null; } return k; }

  /* ---------- material efectivo de cada entidad ---------- */
  function claveDe(k) {
    const pr = A.propsDe(k); if (pr && String(pr.material || '').startsWith('u:')) return pr.material;
    if (k[0] === 'n') { const o = E.nuevos().get(k.slice(1)); return o && o.datos && o.datos.material ? 'c:' + o.datos.material : null; }
    const z = A.P[+k.slice(1)]; if (!z) return null; if (z.material) return 'c:' + z.material;
    return z.mat >= 0 && A.D.materiales[z.mat] ? 'm:' + A.D.materiales[z.mat][0] : null;
  }
  function todasLasClaves() { const out = []; for (const o of E.nuevos().values()) if (A.tipoBase(o.tipo) !== 'nota') out.push('n' + o.id); for (let i = 0; i < A.N; i++) { const z = A.P[i]; if (!z.del && z.cat !== 'txt' && z.cat !== 'col' && z.cat !== 'luz') out.push('p' + i); } return out; }
  function usos(clave, dentro) { const base = dentro || todasLasClaves(); return base.filter(k => claveDe(k) === clave); }
  function enUso() { const m = new Map(); for (const k of todasLasClaves()) { const c = claveDe(k); if (c) m.set(c, (m.get(c) || 0) + 1); } return [...m].sort((a, b) => b[1] - a[1]); }
  function nombreDe(k) {
    if (!k) return 'el original'; if (k.startsWith('preset:')) return (PRESETS[k.slice(7)] || {}).n || k;
    if (k.startsWith('u:')) { const m = mats().get(k.slice(2)); return m ? m.nombre : 'propio'; }
    if (k.startsWith('c:')) return (A.MATERIALES[k.slice(2)] || {}).n || k.slice(2); return k.slice(2).replace(/_/g, ' ');
  }
  function seleccionarIguales(clave) {
    clave = clave || (A.sel.length ? claveDe(A.sel[0]) : null); if (!clave) { A.pista('Lo elegido no tiene un material reconocible.'); return []; }
    const ks = usos(clave).filter(A.seleccionable); A.seleccionar(ks); A.pista(ks.length + ' objeto(s) con «' + nombreDe(clave) + '».'); return ks;
  }

  /* ---------- asignar y reemplazar (un solo paso de deshacer para los objetos nuevos) ---------- */
  function docsProps(keysN, material) {
    const docs = [];
    for (const k of keysN) { const o = E.nuevos().get(k.slice(1)); if (!o) continue; const p = Object.assign({}, o.props || {}); if (material) p.material = material; else delete p.material; const d = A.docActualizado(o, { props: p }); if (d) docs.push(d); }
    return docs;
  }
  function asignar(keys, destino, etiqueta) {
    const mat = claveDestino(destino); if (!mat) return 0; keys = keys || A.sel;
    const n = keys.filter(k => k[0] === 'n'), p = keys.filter(k => k[0] === 'p');
    const docs = docsProps(n, mat); if (docs.length) A.guardar(docs, { etiqueta: etiqueta || ('Material ' + nombreDe(mat)) });
    if (p.length) { const obj = A.objetivoProps(p); if (obj) A.guardarProps({ material: mat }, obj); }
    return n.length + p.length;
  }
  function reemplazar(origen, destino, ambito) {
    const mat = claveDestino(destino); if (!origen || !mat || origen === mat) return 0;
    const base = ambito === 'seleccion' ? A.sel.slice() : null; const ks = usos(origen, base);
    const n = ks.filter(k => k[0] === 'n'), p = ks.filter(k => k[0] === 'p'); const docs = docsProps(n, mat);
    let sueltas = [];
    if (p.length) {
      if (origen.startsWith('u:')) { /* piezas del mapa con ese material propio: se cambian sus documentos de propiedades */
        const vistos = new Set(); const ef = A.efectivos();
        for (const k of p) { const id = A.P[+k.slice(1)].props; if (!id || vistos.has(id)) continue; vistos.add(id); const d = ef.get(id); if (!d || !d.props || d.props.material !== origen) continue; docs.push({ id, data: Object.assign(A.clon(d), { props: Object.assign({}, d.props, { material: mat }), actualizado: A.ahora() }) }); }
      } else sueltas = p;
    }
    if (docs.length) A.guardar(docs, { etiqueta: 'Reemplazar ' + nombreDe(origen) + ' por ' + nombreDe(mat) });
    if (sueltas.length) { const obj = A.objetivoProps(sueltas); if (obj) A.guardarProps({ material: mat }, obj); }
    A.pista(ks.length ? ks.length + ' objeto(s): «' + nombreDe(origen) + '» → «' + nombreDe(mat) + '».' : 'Nada usa «' + nombreDe(origen) + '»' + (base ? ' en la selección.' : '.'));
    return ks.length;
  }
  /* editar un material: en todas sus instancias o solo en la selección (copia local) */
  function guardarMaterial(id, datos, ambito) {
    const t = A.ahora(); const prev = id ? mats().get(id) : null;
    if (!id || ambito !== 'local') { const nid = id || ('mat-' + Date.now().toString(36)); A.guardarCol('materiales', nid, Object.assign({}, prev || {}, datos, { actualizado: t, creado: (prev && prev.creado) || t })); return nid; }
    const nid = 'mat-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const nombre = datos.nombre && datos.nombre !== (prev && prev.nombre) ? datos.nombre : ((prev && prev.nombre) || 'Material') + ' (local)';
    A.guardarCol('materiales', nid, Object.assign({}, prev || {}, datos, { nombre, copia_de: id, actualizado: t, creado: t }));
    const ks = A.sel.filter(k => claveDe(k) === 'u:' + id); asignar(ks, 'u:' + nid, 'Material local ' + nombre); return nid;
  }

  /* ---------- colores recientes y paletas propias ---------- */
  const LS = 'oo-editor-colores-recientes';
  const leerRec = () => { try { const l = JSON.parse(localStorage.getItem(LS) || '[]'); return Array.isArray(l) ? l.slice(0, 14) : []; } catch (e) { return []; } };
  function reciente(c) { if (!/^#[0-9a-f]{6}$/i.test(c || '')) return; const l = [c.toLowerCase()].concat(leerRec().filter(x => x !== c.toLowerCase())).slice(0, 14); try { localStorage.setItem(LS, JSON.stringify(l)); } catch (e) { } }
  const ID_PAL = '_paletas'; /* documento sin «nombre»: materiales.js no lo lista como material */
  const PAL_BASE = [{ nombre: 'Operación Oficina', colores: ['#ecebe4', '#d9d6cf', '#a5553a', '#2f6e8e', '#1d6b3a', '#e0b81a', '#c62828', '#4a555a', '#202428', '#8b959e'] }];
  function paletas() { const d = mats().get(ID_PAL); return d && Array.isArray(d.paletas) && d.paletas.length ? d.paletas : PAL_BASE; }
  function guardarPaletas(l) { A.guardarCol('materiales', ID_PAL, { tipo: 'paletas', paletas: l, actualizado: A.ahora() }); }
  function agregarAPaleta(i, color) { const l = A.clon(paletas()); const p = l[i] || l[0]; if (!p.colores.includes(color)) p.colores.push(color); guardarPaletas(l); }
  function nuevaPaleta(nombre, colores) { const l = A.clon(paletas()); l.push({ nombre: nombre || 'Paleta ' + (l.length + 1), colores: colores || [] }); guardarPaletas(l); return l.length - 1; }
  function quitarDePaleta(i, color) { const l = A.clon(paletas()); if (!l[i]) return; l[i].colores = l[i].colores.filter(c => c !== color); guardarPaletas(l); }

  /* ---------- vista previa 3D del material ---------- */
  let rPrev = null;
  function vistaPrevia(cv, m) {
    try {
      if (!rPrev) { rPrev = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); rPrev.setPixelRatio(1); rPrev.outputEncoding = T.sRGBEncoding; }
      rPrev.setSize(cv.width, cv.height, false);
      const sc = new T.Scene(); sc.add(new T.HemisphereLight(0xffffff, 0x666666, 0.75)); const dl = new T.DirectionalLight(0xffffff, 0.9); dl.position.set(-2, 4, 3); sc.add(dl);
      const mt = construirMaterial(m); const cubo = new T.Mesh(new T.BoxGeometry(1.6, 1.6, 1.6), mt); cubo.position.set(-1.1, 0, 0); cubo.rotation.y = 0.6;
      const esf = new T.Mesh(new T.SphereGeometry(0.9, 40, 24), mt); esf.position.set(1.1, 0, 0); sc.add(cubo, esf);
      const cam = new T.PerspectiveCamera(32, cv.width / cv.height, 0.1, 50); cam.position.set(0, 1.6, 5.6); cam.lookAt(0, 0, 0);
      rPrev.setClearColor(0x000000, 0); rPrev.render(sc, cam);
      const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height); g.drawImage(rPrev.domElement, 0, 0);
      cubo.geometry.dispose(); esf.geometry.dispose(); mt.dispose();
    } catch (e) { console.warn('vista previa del material', e); }
  }

  /* ---------- sección «Biblioteca» de la pestaña Material ---------- */
  let cerrados = new Set(); try { cerrados = new Set(JSON.parse(localStorage.getItem('oo-editor-matcerrados') || '[]')); } catch (e) { } /* grupos de la biblioteca plegados (en el navegador) */
  function seccionTab(act) {
    const sinSel = !A.sel.length; let h = '';
    if (!sinSel) {
      const n = act ? usos(act).length : 0;
      h += `<div class="fila matpro-acc"><button data-mpro="editar"${act && act.startsWith('u:') ? '' : ' disabled'}>${svg('lapiz')}Editar este material</button><button data-mpro="iguales"${act ? '' : ' disabled'}>${svg('sel')}Seleccionar todo lo que lo usa${act ? ' (' + n + ')' : ''}</button><button data-mpro="reemplazar">${svg('recargar')}Reemplazar…</button></div>`;
    }
    h += `<h3>Biblioteca <small>${Object.keys(PRESETS).length} materiales</small> <span class="acciones"><button data-mpro="reemplazar" title="Cambiar un material por otro en todo el mapa">${svg('recargar')}Reemplazo masivo</button></span></h3>`;
    h += `<p class="ayuda">${sinSel ? 'Clic en un material para crear uno propio a partir de él.' : 'Clic para pintar lo elegido (solo lo elegido: las demás superficies con el mismo material no cambian). Los objetos que usan el mismo preset comparten el material.'}</p>`;
    for (const g of GRUPOS) {
      const ks = Object.keys(PRESETS).filter(k => PRESETS[k].g === g); const abierto = !cerrados.has(g);
      h += `<details class="matpro-grupo" data-mpro-grupo="${esc(g)}"${abierto ? ' open' : ''}><summary>${esc(g)} <small>${ks.length}</small></summary><div class="muestras matpro">` + ks.map(k => {
        const p = PRESETS[k], on = act === 'u:preset-' + k; return `<button class="muestra${on ? ' on' : ''}" data-mpro-preset="${k}" title="${esc(p.n)}"><img src="${esc(mini(Object.assign({ preset: k }, p)))}" alt=""><span>${esc(p.n)}</span></button>`;
      }).join('') + '</div></details>';
    }
    return h;
  }

  /* ---------- editor de material ---------- */
  async function editor(id, opts) {
    opts = opts || {};
    const m0 = id ? mats().get(id) : null;
    const base = opts.preset ? docPreset(opts.preset) : { nombre: 'Material ' + ([...mats().values()].filter(x => x && x.nombre).length + 1), color: '#c9c3b6', textura: '', rugosidad: 0.8, metal: 0, emision: '#000000', emisionInt: 0, opacidad: 1, escala: 1, escalaUV: 1, mapeo: 'mundo', rotacionUV: 0, relieve: 1, suciedad: 0, desgaste: 0, semilla: 1 };
    const m = Object.assign({}, base, m0 || {}); if (m.mapeo == null && (m0 && !esPro(m0))) m.mapeo = 'cara';
    const usan = id ? usos('u:' + id) : [], enSel = id ? A.sel.filter(k => claveDe(k) === 'u:' + id) : [];
    const txs = [...A.efectivos('assets')].filter(([, d]) => d && d.tipo === 'textura');
    const opT = sel => txs.map(([tid, d]) => `<option value="${esc(tid)}"${sel === tid ? ' selected' : ''}>${esc(d.nombre)}</option>`).join('');
    const opP = Object.keys(PRESETS).map(k => `<option value="${k}"${m.preset === k ? ' selected' : ''}>${esc(PRESETS[k].n)}</option>`).join('');
    const rng = (k, l, mn, mx, st, v) => `<label class="campo"><span>${l}: <output data-out="${k}">${A.fmt(+(v != null ? v : m[k]) || 0, 2)}</output></span><input type="range" data-m="${k}" min="${mn}" max="${mx}" step="${st}" value="${v != null ? v : m[k]}"></label>`;
    const ambitoHtml = id && usan.length > 1 ? `<div class="campo ancho matpro-ambito"><span>¿Dónde se aplica el cambio?</span><label class="chk"><input type="radio" name="mproAmb" value="todas" checked> En todas las instancias (${usan.length} objetos comparten este material)</label><label class="chk"><input type="radio" name="mproAmb" value="local"${enSel.length ? '' : ' disabled'}> Solo en la selección (${enSel.length}): se crea una copia local</label></div>` : '';
    const pr = A.abrirModal(`<div class="cab">${svg('pintar')} ${id ? 'Editar' : 'Nuevo'} material</div><div class="cont matpro-ed"><div class="matpro-prev"><canvas width="300" height="150" data-mpro-prev></canvas><img data-mpro-tex alt="" title="Textura"></div><div class="ajustes">
      <label class="campo"><span>Nombre</span><input type="text" data-m="nombre" value="${esc(m.nombre)}" data-foco></label>
      <label class="campo"><span>Base</span><select data-m="preset"><option value="">Color liso / textura importada</option>${opP}</select></label>
      <div class="campo ancho"><span>Color</span><div class="matpro-color"><input type="color" data-m="color" value="${esc(m.color)}"><input type="text" data-m="colorHex" value="${esc(m.color)}" maxlength="7" spellcheck="false" aria-label="Código hexadecimal"><span class="matpro-sw" data-mpro-rec></span></div>
        <div class="matpro-pal"><select data-mpro-pal>${paletas().map((p, i) => `<option value="${i}">${esc(p.nombre)}</option>`).join('')}</select><span class="matpro-sw" data-mpro-palsw></span><button data-mpro-paladd title="Añadir el color actual a la paleta">${svg('mas')}</button><button data-mpro-palnueva title="Paleta nueva">Nueva paleta</button></div></div>
      <label class="campo"><span>Textura importada</span><select data-m="textura"><option value="">(ninguna)</option>${opT(m.textura)}</select></label><label class="campo"><span>&nbsp;</span><button data-mat-imptex>${svg('subir')}Importar textura…</button></label>
      <label class="campo"><span>Mapeo</span><select data-m="mapeo"><option value="mundo"${m.mapeo !== 'cara' ? ' selected' : ''}>Mundo (repite cada X metros)</option><option value="cara"${m.mapeo === 'cara' ? ' selected' : ''}>Por cara (repeticiones)</option></select></label>
      ${rng('escala', 'Escala (m por repetición)', 0.1, 10, 0.1)}${rng('escalaUV', 'Repeticiones por cara', 0.25, 20, 0.25)}${rng('rotacionUV', 'Rotación UV (°)', 0, 360, 5)}
      ${rng('rugosidad', 'Rugosidad', 0, 1, 0.05)}${rng('metal', 'Metal', 0, 1, 0.05)}${rng('opacidad', 'Opacidad (1 = opaco)', 0.05, 1, 0.05)}
      ${rng('relieve', 'Relieve (normal map)', 0, 3, 0.1)}<label class="campo"><span>Normal map importado</span><select data-m="normal"><option value="">(el de la textura)</option>${opT(m.normal)}</select></label>
      ${rng('suciedad', 'Suciedad', 0, 1, 0.05)}${rng('desgaste', 'Desgaste', 0, 1, 0.05)}${rng('semilla', 'Variación', 1, 20, 1)}
      <label class="campo"><span>Emisión (brillo propio)</span><input type="color" data-m="emision" value="${esc(m.emision || '#000000')}"></label>${rng('emisionInt', 'Intensidad de emisión', 0, 3, 0.1)}
      ${ambitoHtml}
      </div></div><div class="pie">${id ? '<button class="peligro" data-mat-borrar>Borrar</button><button data-mpro-dup>Duplicar</button>' : ''}<button data-a="m-no">Cancelar</button><button class="prim" data-a="m-si">${id ? 'Guardar' : 'Crear'}${!id && A.sel.length ? ' y asignar' : ''}</button></div>`);
    const caja = $('#modalCaja'); let ambito = 'todas', tPrev = 0;
    const prev = () => { clearTimeout(tPrev); tPrev = setTimeout(() => { const cv = caja.querySelector('[data-mpro-prev]'); if (cv) vistaPrevia(cv, m); const im = caja.querySelector('[data-mpro-tex]'); if (im) im.src = mini(m) || ''; }, 60); };
    const pintarSw = () => {
      const r = caja.querySelector('[data-mpro-rec]'); if (r) r.innerHTML = leerRec().map(c => `<button style="background:${esc(c)}" data-mpro-c="${esc(c)}" title="${esc(c)}"></button>`).join('') || '<small>Sin colores recientes</small>';
      const sp = caja.querySelector('[data-mpro-pal]'), i = sp ? +sp.value : 0, p = paletas()[i] || paletas()[0];
      const s = caja.querySelector('[data-mpro-palsw]'); if (s) s.innerHTML = (p.colores || []).map(c => `<button style="background:${esc(c)}" data-mpro-c="${esc(c)}" title="${esc(c)} · clic derecho: quitar" data-mpro-pc="${i}"></button>`).join('');
    };
    const ponerColor = c => { m.color = c; const a = caja.querySelector('[data-m="color"]'), b = caja.querySelector('[data-m="colorHex"]'); if (a) a.value = c; if (b) b.value = c; prev(); };
    const visibles = () => { const mundo = m.mapeo !== 'cara'; const f = (k, v) => { const el = caja.querySelector(`[data-m="${k}"]`); if (el) el.closest('.campo').hidden = !v; }; f('escala', mundo); f('escalaUV', !mundo); };
    caja.addEventListener('input', e => {
      const k = e.target.dataset.m; if (!k) return;
      if (k === 'colorHex') { const v = e.target.value.trim(); if (/^#[0-9a-f]{6}$/i.test(v)) ponerColor(v.toLowerCase()); return; }
      m[k] = e.target.type === 'range' ? +e.target.value : e.target.value;
      if (k === 'color') { const b = caja.querySelector('[data-m="colorHex"]'); if (b) b.value = m.color; }
      const o = caja.querySelector(`[data-out="${k}"]`); if (o) o.textContent = A.fmt(+m[k] || 0, 2); prev();
    });
    caja.addEventListener('change', e => {
      const k = e.target.dataset.m;
      if (e.target.name === 'mproAmb') { ambito = e.target.value; return; }
      if (e.target.dataset.mproPal != null) { pintarSw(); return; }
      if (!k || k === 'colorHex') return; m[k] = e.target.type === 'range' ? +e.target.value : e.target.value;
      if (k === 'preset') { if (m.preset && PRESETS[m.preset]) { const p = PRESETS[m.preset]; Object.assign(m, { patron: p.patron, color: p.color, rugosidad: p.rugosidad == null ? 0.8 : p.rugosidad, metal: p.metal || 0, escala: p.escala || 1, relieve: p.relieve == null ? 1 : p.relieve, suciedad: p.suciedad || 0, desgaste: p.desgaste || 0, mapeo: 'mundo', textura: '' }); for (const kk of ['color', 'rugosidad', 'metal', 'escala', 'relieve', 'suciedad', 'desgaste', 'mapeo', 'textura']) { const el = caja.querySelector(`[data-m="${kk}"]`); if (el) el.value = m[kk]; const o = caja.querySelector(`[data-out="${kk}"]`); if (o) o.textContent = A.fmt(+m[kk] || 0, 2); } const hx = caja.querySelector('[data-m="colorHex"]'); if (hx) hx.value = m.color; } else { m.patron = ''; } }
      if (k === 'textura' && m.textura) { m.preset = ''; m.patron = ''; const s = caja.querySelector('[data-m="preset"]'); if (s) s.value = ''; }
      if (k === 'color') reciente(m.color);
      visibles(); prev();
    });
    caja.addEventListener('click', async e => {
      const c = e.target.closest('[data-mpro-c]'); if (c) { e.preventDefault(); ponerColor(c.dataset.mproC); return; }
      if (e.target.closest('[data-mpro-paladd]')) { e.preventDefault(); const sp = caja.querySelector('[data-mpro-pal]'); agregarAPaleta(sp ? +sp.value : 0, m.color); setTimeout(pintarSw, 30); return; }
      if (e.target.closest('[data-mpro-palnueva]')) { e.preventDefault(); const i = nuevaPaleta('Paleta ' + (paletas().length + 1), [m.color]); setTimeout(() => { const sp = caja.querySelector('[data-mpro-pal]'); if (sp) { sp.innerHTML = paletas().map((p, j) => `<option value="${j}">${esc(p.nombre)}</option>`).join(''); sp.value = String(i); } pintarSw(); }, 30); return; }
      if (e.target.closest('[data-mat-imptex]') && window.OOImportados) { e.preventDefault(); const ids = await OOImportados.importarTextura(); if (ids && ids[0]) { m.textura = ids[0]; m.preset = ''; m.patron = ''; const s = caja.querySelector('[data-m="textura"]'); if (s) { s.insertAdjacentHTML('beforeend', `<option value="${esc(ids[0])}" selected>Textura nueva</option>`); s.value = ids[0]; } prev(); } return; }
      if (e.target.closest('[data-mpro-dup]')) { e.preventDefault(); const nid = 'mat-' + Date.now().toString(36); A.guardarCol('materiales', nid, Object.assign({}, m, { nombre: m.nombre + ' (copia)', copia_de: id, creado: A.ahora(), actualizado: A.ahora() })); A.cerrarModal(null); A.pista('Material duplicado: «' + m.nombre + ' (copia)».'); return; }
      if (e.target.closest('[data-mat-borrar]')) { e.preventDefault(); A.guardarCol('materiales', id, null); A.cerrarModal(null); }
    });
    caja.addEventListener('contextmenu', e => { const c = e.target.closest('[data-mpro-pc]'); if (!c) return; e.preventDefault(); quitarDePaleta(+c.dataset.mproPc, c.dataset.mproC); setTimeout(pintarSw, 30); });
    pintarSw(); visibles(); prev();
    if (await pr !== true) return null;
    reciente(m.color);
    const datos = Object.assign({}, m); delete datos.colorHex; for (const k of ['escala', 'escalaUV', 'rotacionUV', 'rugosidad', 'metal', 'opacidad', 'relieve', 'suciedad', 'desgaste', 'semilla', 'emisionInt']) if (datos[k] != null) datos[k] = +datos[k];
    if (!datos.preset) delete datos.preset; if (!datos.patron) delete datos.patron; if (!datos.normal) delete datos.normal;
    const nid = guardarMaterial(id, datos, ambito);
    if (!id && A.sel.length) asignar(A.sel, 'u:' + nid);
    return nid;
  }

  /* ---------- reemplazo masivo ---------- */
  async function dialogoReemplazo() {
    const uso = enUso().slice(0, 150); if (!uso.length) { A.pista('Todavía no hay materiales en uso.'); return; }
    const act = A.sel.length ? claveDe(A.sel[0]) : null;
    const dest = Object.keys(PRESETS).map(k => ['preset:' + k, 'Biblioteca · ' + PRESETS[k].n]).concat([...mats()].filter(([, x]) => x && x.nombre).map(([id, x]) => ['u:' + id, 'Mis materiales · ' + x.nombre]));
    let origen = act && uso.some(u => u[0] === act) ? act : uso[0][0], destino = dest[0][0], ambito = 'mapa';
    const pr = A.abrirModal(`<div class="cab">${svg('recargar')} Reemplazar un material</div><div class="cont"><div class="ajustes">
      <label class="campo ancho"><span>Material que se cambia</span><select id="mproOrigen">${uso.map(([k, n]) => `<option value="${esc(k)}"${k === origen ? ' selected' : ''}>${esc(nombreDe(k))} · ${A.fmtInt(n)} objeto(s)</option>`).join('')}</select></label>
      <label class="campo ancho"><span>Por</span><select id="mproDestino">${dest.map(([k, n]) => `<option value="${esc(k)}">${esc(n)}</option>`).join('')}</select></label>
      <label class="chk"><input type="radio" name="mproAmbR" value="mapa" checked> En todo el mapa</label><label class="chk"><input type="radio" name="mproAmbR" value="seleccion"${A.sel.length ? '' : ' disabled'}> Solo en la selección (${A.sel.length})</label>
      <p class="ayuda">Los objetos nuevos cambian en un solo paso (Ctrl+Z lo deshace). Las piezas del mapa original reciben el material como propiedad.</p></div></div>
      <div class="pie"><button data-a="m-no">Cancelar</button><button class="prim" data-a="m-si">Reemplazar</button></div>`);
    setTimeout(() => { const a = $('#mproOrigen'), b = $('#mproDestino'); if (a) a.addEventListener('change', () => { origen = a.value; }); if (b) b.addEventListener('change', () => { destino = b.value; }); document.querySelectorAll('[name="mproAmbR"]').forEach(r => r.addEventListener('change', () => { if (r.checked) ambito = r.value; })); }, 30);
    if (await pr !== true) return 0;
    return reemplazar(origen, destino, ambito);
  }

  /* ---------- clics de la pestaña ---------- */
  document.addEventListener('click', e => {
    const p = e.target.closest('[data-mpro-preset]'); if (p) { e.preventDefault(); const k = p.dataset.mproPreset; if (A.sel.length) { asignar(A.sel, 'preset:' + k); setTimeout(() => OOMateriales.pintarTab(), 40); } else editor(null, { preset: k }); return; }
    const b = e.target.closest('[data-mpro]'); if (!b) return; e.preventDefault();
    const act = A.sel.length ? claveDe(A.sel[0]) : null;
    if (b.dataset.mpro === 'editar' && act && act.startsWith('u:')) editor(act.slice(2));
    else if (b.dataset.mpro === 'iguales') seleccionarIguales(act);
    else if (b.dataset.mpro === 'reemplazar') dialogoReemplazo();
  });
  document.addEventListener('toggle', e => { const d = e.target; if (!d || !d.dataset || !d.dataset.mproGrupo) return; if (d.open) cerrados.delete(d.dataset.mproGrupo); else cerrados.add(d.dataset.mproGrupo); try { localStorage.setItem('oo-editor-matcerrados', JSON.stringify([...cerrados])); } catch (er) { } }, true);
  window.OOMatPro = { PRESETS, GRUPOS, PATRON_CAT, extender, construirMaterial, texturasDe, mini, triplanar, docPreset, idPreset, claveDe, usos, enUso, nombreDe, seleccionarIguales, asignar, reemplazar, guardarMaterial, editor, dialogoReemplazo, seccionTab, paletas, agregarAPaleta, nuevaPaleta, quitarDePaleta, reciente, recientes: leerRec, vistaPrevia };
})();
