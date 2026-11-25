/* Asistente del editor (bot con Claude). Solo en modo nube (?p=<proyecto>) y si el servidor tiene ANTHROPIC_API_KEY (/api/config).
   El bucle va aquí: se manda la conversación a /api/proyectos/<p>/asistente (api/app/rutas/asistente.py), y si Claude pide
   herramientas se ejecutan en este editor y se vuelve a llamar con los resultados. La conversación se reenvía sin tocar (también los
   bloques de razonamiento, que la API exige tal cual) y se guarda en sessionStorage por proyecto.
   Herramientas: estado_mapa, buscar_catalogo, generar_terreno, colocar_objetos, pintar_vegetacion, borrar_objetos, guardar_version,
   deshacer. API: OOAsistente.abrir(), enviar(texto), herramientas (para las pruebas). */
(function () {
  'use strict';
  const E = window.OOEditor; if (!E || !E.api) return;
  const A = E.api, esc = A.esc;
  const PROYECTO = new URLSearchParams(location.search).get('p');
  if (!PROYECTO) return;
  const CLAVE = 'mc-asistente-' + PROYECTO, MAX_VUELTAS = 20;
  let historial: any[] = [];
  try { historial = JSON.parse(sessionStorage.getItem(CLAVE) || '[]'); if (!Array.isArray(historial)) historial = []; } catch { historial = []; }
  const guardarHist = (): void => { try { sessionStorage.setItem(CLAVE, JSON.stringify(historial)); } catch { /* lleno o bloqueado */ } };
  let ocupado = false;

  /* ───────── herramientas ───────── */
  const sinTilde = (s: any): string => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const r1 = (v: number): number => Math.round(v * 10) / 10;
  const num = (v: any): number | null => (typeof v === 'number' && isFinite(v) ? v : null);
  const nombreCat = (c: string): string => ((A.CATEGORIAS || []).find((x: any) => x[0] === c) || [])[1] || c;

  const herramientas: Record<string, (e: any) => Promise<any> | any> = {
    estado_mapa() {
      const L = A.limitesMapa, porTipo: Record<string, number> = {}, ult: any[] = [];
      for (const o of E.nuevos().values()) {
        const t = A.tipoBase(o.tipo); if (t === 'nota') continue; porTipo[t] = (porTipo[t] || 0) + 1;
        ult.push({ id: 'n' + o.id, tipo: o.tipo, nombre: A.nombreEntidades(['n' + o.id]), x: r1(+o.datos.x || 0), z: r1(+o.datos.z || 0) });
      }
      const T0 = window.OOTerreno && OOTerreno.datos();
      let terreno: any = null;
      if (T0) {
        const zonas: Record<string, number> = {}; for (let k = 0; k < T0.pin.length; k++) if (T0.pin[k] !== 255) { const z = T0.paleta[T0.pin[k]] || '?'; zonas[z] = (zonas[z] || 0) + 1; }
        const pct: Record<string, string> = {}; for (const [z, n] of Object.entries(zonas)) pct[z] = Math.round(n / T0.pin.length * 100) + '%';
        terreno = { desde: [T0.x0, T0.z0], hasta: [r1(T0.x0 + (T0.nx - 1) * T0.paso), r1(T0.z0 + (T0.nz - 1) * T0.paso)], paso_m: T0.paso, agua: T0.agua, zonas: pct };
      }
      return {
        mapa: A.mapa, suelo_base: A.N ? { desde: [r1(L.min.x), r1(L.min.z)], hasta: [r1(L.max.x), r1(L.max.z)], centro: [r1((L.min.x + L.max.x) / 2), r1((L.min.z + L.max.z) / 2)] } : null,
        piezas_del_mapa: A.N, objetos_añadidos: porTipo, ultimos_objetos: ult.slice(-15), terreno, seleccion: (A.sel || []).slice(0, 20),
        motor_rust: !!(window.OOMotor && OOMotor.activo())
      };
    },
    buscar_catalogo(e) {
      const ws = sinTilde(e.texto).split(/\s+/).filter(Boolean); if (!ws.length) throw new Error('Escribe qué buscar.');
      const lista = (A.ITEMS || []).filter((i: any) => { const t = sinTilde(i.n + ' ' + nombreCat(i.cat) + ' ' + String(i.id).replace(/_/g, ' ')); return ws.every((w) => t.includes(w)); });
      return { total: lista.length, objetos: lista.slice(0, 20).map((i: any) => ({ id: i.id, nombre: i.n, categoria: nombreCat(i.cat), tamano_m: [num(+i.datos?.sx) ?? null, num(+i.datos?.sy) ?? null, num(+i.datos?.sz) ?? null] })) };
    },
    async generar_terreno(e) {
      if (!window.OOProcedural) throw new Error('El terreno procedural no está disponible en este editor.');
      return OOProcedural.generar(e);
    },
    colocar_objetos(e) {
      const objs = Array.isArray(e.objetos) ? e.objetos : []; if (!objs.length) throw new Error('No hay objetos que colocar.');
      if (objs.length > 200) throw new Error('Máximo 200 objetos por llamada.');
      const lista: any[] = [], ids: string[] = [], errores: string[] = [];
      objs.forEach((o: any, j: number) => {
        const it = A.itemPorId(String(o.tipo || '')); const x = num(o.x), z = num(o.z);
        if (!it) { errores.push(`#${j}: «${o.tipo}» no está en el catálogo (usa buscar_catalogo)`); return; }
        if (x == null || z == null) { errores.push(`#${j}: faltan x o z`); return; }
        const d = A.clon(it.datos || {}), y = num(o.y) ?? (window.OOTerreno ? OOTerreno.alturaEn(x, z) : 0), f = num(o.escala);
        Object.assign(d, { x: A.r3(x), y: A.r3(y), z: A.r3(z), giroY: A.r3(num(o.giro) ?? 0) });
        if (f && f > 0 && f !== 1) for (const k of ['sx', 'sy', 'sz']) if (d[k] != null) d[k] = A.r3(+d[k] * f);
        if (A.tipoBase(it.tipo) === 'copia' && Array.isArray(d.d0)) { d.origen = 'centro'; d.y = A.r3(y + d.d0[1] / 2); }
        const id = A.nuevoId() + 'a' + j; ids.push('n' + id);
        lista.push({ id, data: A.docNuevo(id, it.tipo, d, o.nombre ? { props: { nombre: String(o.nombre).slice(0, 80) } } : undefined) });
      });
      if (lista.length) A.guardar(lista, { etiqueta: 'Asistente: colocar ' + lista.length + ' objeto' + (lista.length === 1 ? '' : 's') });
      return { colocados: ids.length, ids, errores };
    },
    pintar_vegetacion(e) {
      if (!window.OOTerrenoPro) throw new Error('La vegetación no está disponible.');
      const x = num(e.x), z = num(e.z), radio = num(e.radio); if (x == null || z == null || !radio || radio <= 0) throw new Error('Faltan x, z o radio.');
      const id = OOTerrenoPro.pintarVegetacionGrupo([[x, z]], Math.min(radio, 300), { tipo: e.tipo || 'mezcla', densidad: num(e.densidad) ?? 4 });
      return id ? { id: 'n' + id } : { aviso: 'No cabía ninguna planta (zona ocupada o radio pequeño).' };
    },
    borrar_objetos(e) {
      const ids = Array.isArray(e.ids) ? e.ids : [], lista: any[] = [], noEstan: string[] = [];
      for (const k of ids) { const o = String(k).startsWith('n') ? E.nuevos().get(String(k).slice(1)) : null; if (o) lista.push({ id: o.docId, data: null }); else noEstan.push(String(k)); }
      if (lista.length) { A.seleccionar([]); A.guardar(lista, { etiqueta: 'Asistente: borrar ' + lista.length + ' objeto' + (lista.length === 1 ? '' : 's') }); }
      return { borrados: lista.length, no_encontrados: noEstan };
    },
    async guardar_version(e) {
      if (!window.OOProductividad) throw new Error('Las versiones no están disponibles.');
      const id = await OOProductividad.guardarVersion(String(e.nombre || 'Versión del asistente').slice(0, 100));
      if (!id) throw new Error('No se pudo guardar la versión.');
      return { id, como_volver: 'Historial (icono del reloj) → Versiones → Restaurar' };
    },
    deshacer(e) {
      if (e.que === 'terreno') { if (!window.OOTerreno) throw new Error('No hay terreno.'); OOTerreno.deshacer(); return { hecho: 'terreno' }; }
      A.hacerDeshacer(); return { hecho: 'objetos' };
    }
  };
  const ETIQUETAS: Record<string, (e: any) => string> = {
    estado_mapa: () => 'Mirando el mapa', buscar_catalogo: (e) => 'Buscando «' + (e.texto || '') + '» en el catálogo',
    generar_terreno: (e) => 'Generando terreno (' + ((window.OOProcedural && OOProcedural.ESTILOS[e.estilo]) || { n: e.estilo }).n + ')',
    colocar_objetos: (e) => 'Colocando ' + ((e.objetos || []).length) + ' objetos', pintar_vegetacion: () => 'Pintando vegetación',
    borrar_objetos: (e) => 'Borrando ' + ((e.ids || []).length) + ' objetos', guardar_version: (e) => 'Guardando la versión «' + (e.nombre || '') + '»',
    deshacer: (e) => 'Deshaciendo (' + (e.que || 'objetos') + ')'
  };

  /* ───────── interfaz ───────── */
  const css = document.createElement('style');
  css.textContent = `
  #asis{position:fixed;top:56px;right:12px;bottom:12px;width:min(400px,calc(100vw - 24px));z-index:60;display:flex;flex-direction:column;background:var(--panel);color:var(--fg);border:1px solid var(--line);border-radius:12px;box-shadow:var(--sombra,0 12px 40px rgba(0,0,0,.35));overflow:hidden}
  #asis[hidden]{display:none}
  #asis .asis-cab{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line);font-weight:600}
  #asis .asis-cab span{margin-right:auto}
  #asis .asis-cab button{background:none;border:0;color:var(--fg2);cursor:pointer;padding:4px 8px;border-radius:6px;font:inherit;font-size:12.5px}
  #asis .asis-cab button:hover{background:var(--hover);color:var(--fg)}
  #asis .asis-msjs{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:10px;font-size:13.5px;line-height:1.5}
  #asis .m-yo{align-self:flex-end;background:var(--acc);color:var(--acc-fg,#fff);padding:8px 11px;border-radius:12px 12px 2px 12px;max-width:85%;white-space:pre-wrap}
  #asis .m-ia{align-self:flex-start;background:var(--panel2);padding:8px 11px;border-radius:12px 12px 12px 2px;max-width:92%}
  #asis .m-ia p{margin:0 0 6px}#asis .m-ia p:last-child{margin:0}
  #asis .m-her{align-self:flex-start;font-size:12px;color:var(--fg2);display:flex;gap:6px;align-items:center}
  #asis .m-her.ok::before{content:'✓';color:var(--ok)}#asis .m-her.err::before{content:'✕';color:var(--err)}#asis .m-her.va::before{content:'…'}
  #asis .m-err{align-self:stretch;color:var(--err);font-size:12.5px;border:1px solid var(--err);border-radius:8px;padding:6px 9px}
  #asis .asis-vacio{color:var(--fg2);font-size:13px}
  #asis .asis-vacio button{display:block;width:100%;text-align:left;margin-top:6px;background:var(--panel2);border:1px solid var(--line);color:var(--fg);border-radius:8px;padding:7px 9px;cursor:pointer;font:inherit;font-size:12.5px}
  #asis .asis-vacio button:hover{border-color:var(--acc)}
  #asis form{display:flex;gap:8px;padding:10px;border-top:1px solid var(--line)}
  #asis textarea{flex:1;resize:none;min-height:40px;max-height:140px;background:var(--input);color:var(--fg);border:1px solid var(--line);border-radius:8px;padding:8px;font:inherit;font-size:13.5px}
  #asis form button{background:var(--acc);color:var(--acc-fg,#fff);border:0;border-radius:8px;padding:0 14px;font:inherit;font-weight:600;cursor:pointer}
  #asis form button:disabled{opacity:.5;cursor:default}`;
  document.head.appendChild(css);
  const caja = document.createElement('section'); caja.id = 'asis'; caja.hidden = true; caja.setAttribute('aria-label', 'Asistente');
  caja.innerHTML = `<div class="asis-cab"><span>✦ Asistente</span><button type="button" data-asis="nueva" title="Empezar una conversación nueva">Nueva</button><button type="button" data-asis="cerrar" aria-label="Cerrar">✕</button></div>
    <div class="asis-msjs" aria-live="polite"></div>
    <form><textarea rows="2" placeholder="Pídele algo: «rodea el complejo de colinas con un río»…" aria-label="Mensaje para el asistente"></textarea><button type="submit">Enviar</button></form>`;
  document.body.appendChild(caja);
  const msjs = caja.querySelector('.asis-msjs') as HTMLElement, form = caja.querySelector('form') as HTMLFormElement, ta = caja.querySelector('textarea') as HTMLTextAreaElement, bEnviar = form.querySelector('button') as HTMLButtonElement;
  const SUGERENCIAS = ['Rodea el mapa de colinas con un río y bosque', 'Haz una isla tropical con playa y palmeras alrededor del mapa', 'Montañas nevadas al norte y un lago', '¿Qué hay en este mapa?'];

  const formato = (t: string): string => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').split(/\n{2,}/).map((p) => '<p>' + p.replace(/\n/g, '<br>') + '</p>').join('');
  const abajo = (): void => { msjs.scrollTop = msjs.scrollHeight; };
  function añadir(clase: string, html: string): HTMLElement { const d = document.createElement('div'); d.className = clase; d.innerHTML = html; msjs.appendChild(d); abajo(); return d; }
  function pintarTodo(): void {
    msjs.innerHTML = '';
    if (!historial.length) {
      msjs.innerHTML = `<div class="asis-vacio">Puedo generar terreno, colocar objetos del catálogo, pintar vegetación y guardar versiones antes de cambiar nada. Prueba:${SUGERENCIAS.map((s) => `<button type="button" data-sug="${esc(s)}">${esc(s)}</button>`).join('')}</div>`;
      return;
    }
    for (const m of historial) {
      if (typeof m.content === 'string') { añadir(m.role === 'user' ? 'm-yo' : 'm-ia', m.role === 'user' ? esc(m.content) : formato(m.content)); continue; }
      for (const b of m.content || []) {
        if (b.type === 'text' && b.text && m.role === 'assistant') añadir('m-ia', formato(b.text));
        else if (b.type === 'text' && b.text && m.role === 'user') añadir('m-yo', esc(b.text));
        else if (b.type === 'tool_use') añadir('m-her ok', esc((ETIQUETAS[b.name] || (() => b.name))(b.input || {})));
      }
    }
  }

  async function llamar(): Promise<any> {
    const r = await fetch('/api/proyectos/' + encodeURIComponent(PROYECTO as string) + '/asistente', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mensajes: historial }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || ('Error ' + r.status));
    return j;
  }
  async function ejecutar(b: any): Promise<any> {
    const f = herramientas[b.name], et = añadir('m-her va', esc((ETIQUETAS[b.name] || (() => b.name))(b.input || {})));
    try {
      if (!f) throw new Error('Herramienta desconocida: ' + b.name);
      const res = await f(b.input || {}); et.className = 'm-her ok';
      return { type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(res ?? { ok: true }) };
    } catch (e: any) {
      et.className = 'm-her err'; et.title = e.message || String(e);
      return { type: 'tool_result', tool_use_id: b.id, content: 'Error: ' + (e.message || String(e)), is_error: true };
    }
  }

  /** Manda un mensaje y sigue el bucle hasta que Claude termina. */
  async function enviar(texto: string): Promise<void> {
    texto = String(texto || '').trim(); if (!texto || ocupado) return;
    ocupado = true; bEnviar.disabled = true;
    if (!historial.length) msjs.innerHTML = '';
    historial.push({ role: 'user', content: texto }); guardarHist(); añadir('m-yo', esc(texto));
    const pensando = añadir('m-her va', 'Pensando');
    try {
      for (let v = 0; v < MAX_VUELTAS; v++) {
        let r;
        try { r = await llamar(); }
        catch (e) { if (v === 0) { historial.pop(); guardarHist(); } throw e; }
        pensando.remove();
        historial.push({ role: 'assistant', content: r.content }); guardarHist();
        for (const b of r.content || []) if (b.type === 'text' && b.text) añadir('m-ia', formato(b.text));
        if (r.stop_reason === 'refusal') { añadir('m-err', 'Claude no puede ayudar con esa petición.'); break; }
        if (r.stop_reason === 'pause_turn') continue;
        if (r.stop_reason === 'max_tokens') { añadir('m-err', 'La respuesta se cortó por larga. Pídele que siga.'); break; }
        if (r.stop_reason !== 'tool_use') break;
        const usos = (r.content || []).filter((b: any) => b.type === 'tool_use'), resultados = [];
        for (const b of usos) resultados.push(await ejecutar(b));
        historial.push({ role: 'user', content: resultados }); guardarHist();
        if (v === MAX_VUELTAS - 1) añadir('m-err', 'El asistente llevaba demasiados pasos seguidos y se detuvo. Escríbele para que siga.');
      }
    } catch (e: any) { pensando.remove(); añadir('m-err', esc(e.message || String(e))); }
    finally { ocupado = false; bEnviar.disabled = false; ta.focus(); }
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); const t = ta.value; ta.value = ''; enviar(t); });
  ta.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  caja.addEventListener('keydown', (e) => e.stopPropagation()); /* que los atajos del editor no salten mientras escribes */
  caja.addEventListener('click', (e) => {
    const t = e.target as HTMLElement, s = t.closest<HTMLElement>('[data-sug]'), a = t.closest<HTMLElement>('[data-asis]');
    if (s) enviar(s.dataset.sug || '');
    else if (a && a.dataset.asis === 'cerrar') caja.hidden = true;
    else if (a && a.dataset.asis === 'nueva' && !ocupado) { historial = []; guardarHist(); pintarTodo(); ta.focus(); }
  });
  function abrir(): void { caja.hidden = false; pintarTodo(); ta.focus(); }

  /* botón en la barra de arriba, solo si el servidor tiene el asistente configurado */
  fetch('/api/config', { cache: 'no-store' }).then((r) => r.json()).then((c) => {
    if (!c || !c.asistente) return;
    const ref = document.getElementById('bAtajos'); if (!ref || !ref.parentNode) return;
    const b = document.createElement('button'); b.id = 'bAsistente'; b.title = 'Asistente: pídele que genere terreno o coloque objetos';
    b.innerHTML = '<span aria-hidden="true">✦</span><span class="lbl">Asistente</span>';
    b.addEventListener('click', () => (caja.hidden ? abrir() : (caja.hidden = true)));
    ref.parentNode.insertBefore(b, ref);
  }).catch(() => { /* sin asistente */ });

  window.OOAsistente = { abrir, enviar, herramientas, historial: () => historial };
})();
