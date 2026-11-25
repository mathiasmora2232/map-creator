//! Escritor de GLB (glTF 2.0 binario) para la exportación del editor.
//!
//! El editor recorre la escena de three.js y la empaqueta en un bloque binario (formato «OOGB», ver `editor/src/archivos/glb_motor.ts`):
//! nodos con padre, matriz y textos ya en JSON (nombre y extras), mallas (geometría + material), geometrías (atributos en float32 e
//! índices) y un fragmento JSON con lo de arriba del todo (asset, materials, extensiones). Aquí se escribe el resto del JSON (nodos,
//! mallas, accessors, bufferViews), el binario alineado (con min/max y normales normalizadas) y el contenedor GLB.
//!
//! Formato del paquete (little-endian, todo alineado a 4; las matrices a 8):
//! ```text
//! u32 magia "OOGB" (0x4247_4F4F) · u32 versión (1) · u32 nNodos · u32 nMallas · u32 nGeos · u32 nAttrs
//! u32 lenCabecera · bytes (fragmento JSON sin llaves: "asset":{…},"materials":[…],…) · relleno a 4
//! nNodos × (i32 padre, i32 malla, i32 luz, u32 conMatriz, u32 txtOff, u32 txtLen) · relleno a 8 · nNodos × 16 f64 (matriz)
//! u32 lenTextos · bytes (UTF-8) · relleno a 4
//! nMallas × (i32 geo, i32 material, u32 txtOff, u32 txtLen)
//! nGeos × (u32 primerAttr, u32 nAttrs, u32 tipoIndices 0|1=u16|2=u32, u32 nIndices, u32 offIndices)
//! nAttrs × (u32 clase 0=POSITION 1=NORMAL 2=TEXCOORD_0 3=COLOR_0, u32 componentes, u32 cuenta, u32 offDatos)
//! u32 lenDatos · bytes (float32 e índices; los off* son desde el inicio de estos bytes)
//! ```

use core::fmt::Write as _;

pub const MAGIA: u32 = 0x4247_4F4F;
pub const VERSION_PAQUETE: u32 = 1;

#[derive(Debug, PartialEq, Eq)]
pub enum Fallo {
    Corto = 1,
    Magia = 2,
    Version = 3,
    Indice = 4,
    Rango = 5,
    Utf8 = 6,
}

struct Lector<'a> {
    b: &'a [u8],
    p: usize,
}

impl<'a> Lector<'a> {
    fn bytes(&mut self, n: usize) -> Result<&'a [u8], Fallo> {
        let fin = self.p.checked_add(n).ok_or(Fallo::Corto)?;
        if fin > self.b.len() {
            return Err(Fallo::Corto);
        }
        let s = &self.b[self.p..fin];
        self.p = fin;
        Ok(s)
    }
    fn u32(&mut self) -> Result<u32, Fallo> {
        let s = self.bytes(4)?;
        Ok(u32::from_le_bytes([s[0], s[1], s[2], s[3]]))
    }
    fn i32(&mut self) -> Result<i32, Fallo> {
        Ok(self.u32()? as i32)
    }
    fn f64(&mut self) -> Result<f64, Fallo> {
        let s = self.bytes(8)?;
        let mut a = [0u8; 8];
        a.copy_from_slice(s);
        Ok(f64::from_le_bytes(a))
    }
    fn alinear(&mut self, a: usize) -> Result<(), Fallo> {
        let r = (a - self.p % a) % a;
        self.bytes(r).map(|_| ())
    }
}

struct Nodo {
    padre: i32,
    malla: i32,
    luz: i32,
    matriz: Option<[f64; 16]>,
    txt: (usize, usize),
}
struct Malla {
    geo: usize,
    mat: i32,
    txt: (usize, usize),
}
struct Geo {
    attrs: core::ops::Range<usize>,
    tipo_ind: u32,
    n_ind: usize,
    off_ind: usize,
}
struct Attr {
    clase: u32,
    comp: usize,
    cuenta: usize,
    off: usize,
}

const NOMBRES_ATTR: [&str; 4] = ["POSITION", "NORMAL", "TEXCOORD_0", "COLOR_0"];
const TIPOS: [&str; 5] = ["", "SCALAR", "VEC2", "VEC3", "VEC4"];

fn num(s: &mut String, v: f64) {
    if v.is_finite() {
        let _ = write!(s, "{}", v);
    } else {
        s.push('0');
    }
}
fn num32(s: &mut String, v: f32) {
    if v.is_finite() {
        let _ = write!(s, "{}", v);
    } else {
        s.push('0');
    }
}
fn texto<'a>(t: &'a [u8], (o, n): (usize, usize)) -> Result<&'a str, Fallo> {
    let fin = o.checked_add(n).ok_or(Fallo::Rango)?;
    let b = t.get(o..fin).ok_or(Fallo::Rango)?;
    core::str::from_utf8(b).map_err(|_| Fallo::Utf8)
}
fn rellenar(v: &mut Vec<u8>, a: usize, con: u8) {
    while v.len() % a != 0 {
        v.push(con);
    }
}
fn f32_en(d: &[u8], i: usize) -> f32 {
    f32::from_le_bytes([d[i], d[i + 1], d[i + 2], d[i + 3]])
}

/// Paquete «OOGB» → archivo .glb completo.
pub fn crear(paquete: &[u8]) -> Result<Vec<u8>, Fallo> {
    let mut l = Lector { b: paquete, p: 0 };
    if l.u32()? != MAGIA {
        return Err(Fallo::Magia);
    }
    if l.u32()? != VERSION_PAQUETE {
        return Err(Fallo::Version);
    }
    let (n_nodos, n_mallas, n_geos, n_attrs) = (l.u32()? as usize, l.u32()? as usize, l.u32()? as usize, l.u32()? as usize);
    let len_cab = l.u32()? as usize;
    let cabecera = core::str::from_utf8(l.bytes(len_cab)?).map_err(|_| Fallo::Utf8)?;
    l.alinear(4)?;

    let mut nodos = Vec::with_capacity(n_nodos);
    for _ in 0..n_nodos {
        let (padre, malla, luz, con_m, o, n) = (l.i32()?, l.i32()?, l.i32()?, l.u32()?, l.u32()? as usize, l.u32()? as usize);
        nodos.push(Nodo { padre, malla, luz, matriz: if con_m != 0 { Some([0.0; 16]) } else { None }, txt: (o, n) });
    }
    l.alinear(8)?;
    for nd in nodos.iter_mut() {
        let mut m = [0.0f64; 16];
        for x in m.iter_mut() {
            *x = l.f64()?;
        }
        if nd.matriz.is_some() {
            nd.matriz = Some(m);
        }
    }
    let len_txt = l.u32()? as usize;
    let textos = l.bytes(len_txt)?;
    l.alinear(4)?;

    let mut mallas = Vec::with_capacity(n_mallas);
    for _ in 0..n_mallas {
        let (g, m, o, n) = (l.i32()?, l.i32()?, l.u32()? as usize, l.u32()? as usize);
        if g < 0 || g as usize >= n_geos {
            return Err(Fallo::Indice);
        }
        mallas.push(Malla { geo: g as usize, mat: m, txt: (o, n) });
    }
    let mut geos = Vec::with_capacity(n_geos);
    for _ in 0..n_geos {
        let (a0, na, ti, ni, oi) = (l.u32()? as usize, l.u32()? as usize, l.u32()?, l.u32()? as usize, l.u32()? as usize);
        if a0.checked_add(na).map_or(true, |f| f > n_attrs) || ti > 2 {
            return Err(Fallo::Indice);
        }
        geos.push(Geo { attrs: a0..a0 + na, tipo_ind: ti, n_ind: ni, off_ind: oi });
    }
    let mut attrs = Vec::with_capacity(n_attrs);
    for _ in 0..n_attrs {
        let (clase, comp, cuenta, off) = (l.u32()?, l.u32()? as usize, l.u32()? as usize, l.u32()? as usize);
        if clase > 3 || !(1..=4).contains(&comp) {
            return Err(Fallo::Indice);
        }
        attrs.push(Attr { clase, comp, cuenta, off });
    }
    let len_datos = l.u32()? as usize;
    let datos = l.bytes(len_datos)?;

    for nd in &nodos {
        if nd.padre >= n_nodos as i32 || nd.malla >= n_mallas as i32 {
            return Err(Fallo::Indice);
        }
    }

    // ── binario: un bufferView y un accessor por atributo e índice de cada geometría ──
    let mut bin: Vec<u8> = Vec::with_capacity(len_datos + 64);
    let mut vistas = String::with_capacity(n_attrs * 64);
    let mut accs = String::with_capacity(n_attrs * 160);
    let mut n_acc = 0usize;
    let mut acc_attr = vec![0usize; n_attrs];
    let mut acc_ind = vec![usize::MAX; n_geos];
    for (gi, g) in geos.iter().enumerate() {
        for ai in g.attrs.clone() {
            let a = &attrs[ai];
            let n_f = a.cuenta.checked_mul(a.comp).ok_or(Fallo::Rango)?;
            let len = n_f.checked_mul(4).ok_or(Fallo::Rango)?;
            let src = datos.get(a.off..a.off.checked_add(len).ok_or(Fallo::Rango)?).ok_or(Fallo::Rango)?;
            rellenar(&mut bin, 4, 0);
            let ini = bin.len();
            let mut mn = [f32::INFINITY; 4];
            let mut mx = [f32::NEG_INFINITY; 4];
            if a.clase == 1 && a.comp == 3 {
                // normales: glTF las pide de longitud 1
                for v in 0..a.cuenta {
                    let i = v * 12;
                    let (x, y, z) = (f32_en(src, i), f32_en(src, i + 4), f32_en(src, i + 8));
                    let len = (x * x + y * y + z * z).sqrt();
                    let k = if len > 1e-12 { 1.0 / len } else { 0.0 };
                    let c = if len > 1e-12 { [x * k, y * k, z * k] } else { [0.0, 1.0, 0.0] };
                    for (j, val) in c.iter().enumerate() {
                        mn[j] = mn[j].min(*val);
                        mx[j] = mx[j].max(*val);
                        bin.extend_from_slice(&val.to_le_bytes());
                    }
                }
            } else {
                bin.extend_from_slice(src);
                for (k, c) in src.chunks_exact(4).enumerate() {
                    let val = f32::from_le_bytes([c[0], c[1], c[2], c[3]]);
                    let j = k % a.comp;
                    mn[j] = mn[j].min(val);
                    mx[j] = mx[j].max(val);
                }
            }
            if n_acc > 0 {
                vistas.push(',');
                accs.push(',');
            }
            let _ = write!(vistas, "{{\"buffer\":0,\"byteOffset\":{},\"byteLength\":{},\"target\":34962}}", ini, len);
            let _ = write!(accs, "{{\"bufferView\":{},\"byteOffset\":0,\"componentType\":5126,\"count\":{},\"type\":\"{}\"", n_acc, a.cuenta, TIPOS[a.comp]);
            if a.cuenta > 0 {
                accs.push_str(",\"max\":[");
                for j in 0..a.comp {
                    if j > 0 {
                        accs.push(',');
                    }
                    num32(&mut accs, mx[j]);
                }
                accs.push_str("],\"min\":[");
                for j in 0..a.comp {
                    if j > 0 {
                        accs.push(',');
                    }
                    num32(&mut accs, mn[j]);
                }
                accs.push(']');
            }
            accs.push('}');
            acc_attr[ai] = n_acc;
            n_acc += 1;
        }
        if g.tipo_ind != 0 {
            let tam = if g.tipo_ind == 1 { 2 } else { 4 };
            let len = g.n_ind.checked_mul(tam).ok_or(Fallo::Rango)?;
            let src = datos.get(g.off_ind..g.off_ind.checked_add(len).ok_or(Fallo::Rango)?).ok_or(Fallo::Rango)?;
            rellenar(&mut bin, 4, 0);
            let ini = bin.len();
            bin.extend_from_slice(src);
            if n_acc > 0 {
                vistas.push(',');
                accs.push(',');
            }
            let _ = write!(vistas, "{{\"buffer\":0,\"byteOffset\":{},\"byteLength\":{},\"target\":34963}}", ini, len);
            let _ = write!(accs, "{{\"bufferView\":{},\"byteOffset\":0,\"componentType\":{},\"count\":{},\"type\":\"SCALAR\"}}",
                n_acc, if tam == 2 { 5123 } else { 5125 }, g.n_ind);
            acc_ind[gi] = n_acc;
            n_acc += 1;
        }
    }
    rellenar(&mut bin, 4, 0);

    // ── JSON ──
    let mut j = String::with_capacity(textos.len() + n_nodos * 200 + accs.len() + vistas.len() + cabecera.len() + 256);
    j.push('{');
    j.push_str(cabecera);
    if !cabecera.is_empty() {
        j.push(',');
    }
    // hijos de cada nodo (en orden) y raíces de la escena
    let mut hijos: Vec<Vec<u32>> = (0..n_nodos).map(|_| Vec::new()).collect();
    let mut raices = Vec::new();
    for (i, nd) in nodos.iter().enumerate() {
        if nd.padre < 0 {
            raices.push(i);
        } else {
            hijos[nd.padre as usize].push(i as u32);
        }
    }
    j.push_str("\"scene\":0,\"scenes\":[{\"nodes\":[");
    for (k, r) in raices.iter().enumerate() {
        if k > 0 {
            j.push(',');
        }
        let _ = write!(j, "{}", r);
    }
    j.push_str("]}],\"nodes\":[");
    for (i, nd) in nodos.iter().enumerate() {
        if i > 0 {
            j.push(',');
        }
        j.push('{');
        let t = texto(textos, nd.txt)?;
        let mut coma = !t.is_empty();
        j.push_str(t);
        let mut sep = |j: &mut String| {
            if coma {
                j.push(',');
            }
            coma = true;
        };
        if let Some(m) = &nd.matriz {
            sep(&mut j);
            j.push_str("\"matrix\":[");
            for (k, v) in m.iter().enumerate() {
                if k > 0 {
                    j.push(',');
                }
                num(&mut j, *v);
            }
            j.push(']');
        }
        if nd.malla >= 0 {
            sep(&mut j);
            let _ = write!(j, "\"mesh\":{}", nd.malla);
        }
        if nd.luz >= 0 {
            sep(&mut j);
            let _ = write!(j, "\"extensions\":{{\"KHR_lights_punctual\":{{\"light\":{}}}}}", nd.luz);
        }
        if !hijos[i].is_empty() {
            sep(&mut j);
            j.push_str("\"children\":[");
            for (k, h) in hijos[i].iter().enumerate() {
                if k > 0 {
                    j.push(',');
                }
                let _ = write!(j, "{}", h);
            }
            j.push(']');
        }
        j.push('}');
    }
    j.push(']');
    if n_mallas > 0 {
        j.push_str(",\"meshes\":[");
        for (i, m) in mallas.iter().enumerate() {
            if i > 0 {
                j.push(',');
            }
            j.push_str("{\"primitives\":[{\"mode\":4,\"attributes\":{");
            let g = &geos[m.geo];
            for (k, ai) in g.attrs.clone().enumerate() {
                if k > 0 {
                    j.push(',');
                }
                let _ = write!(j, "\"{}\":{}", NOMBRES_ATTR[attrs[ai].clase as usize], acc_attr[ai]);
            }
            j.push('}');
            if acc_ind[m.geo] != usize::MAX {
                let _ = write!(j, ",\"indices\":{}", acc_ind[m.geo]);
            }
            if m.mat >= 0 {
                let _ = write!(j, ",\"material\":{}", m.mat);
            }
            j.push_str("}]");
            let t = texto(textos, m.txt)?;
            if !t.is_empty() {
                j.push(',');
                j.push_str(t);
            }
            j.push('}');
        }
        j.push(']');
    }
    if n_acc > 0 {
        let _ = write!(j, ",\"accessors\":[{}],\"bufferViews\":[{}]", accs, vistas);
    }
    if !bin.is_empty() {
        let _ = write!(j, ",\"buffers\":[{{\"byteLength\":{}}}]", bin.len());
    }
    j.push('}');

    // ── contenedor GLB ──
    let mut json = j.into_bytes();
    rellenar(&mut json, 4, b' ');
    let total = 12 + 8 + json.len() + if bin.is_empty() { 0 } else { 8 + bin.len() };
    let mut out = Vec::with_capacity(total);
    out.extend_from_slice(&0x4654_6C67u32.to_le_bytes()); // "glTF"
    out.extend_from_slice(&2u32.to_le_bytes());
    out.extend_from_slice(&(total as u32).to_le_bytes());
    out.extend_from_slice(&(json.len() as u32).to_le_bytes());
    out.extend_from_slice(&0x4E4F_534Au32.to_le_bytes()); // "JSON"
    out.extend_from_slice(&json);
    if !bin.is_empty() {
        out.extend_from_slice(&(bin.len() as u32).to_le_bytes());
        out.extend_from_slice(&0x004E_4942u32.to_le_bytes()); // "BIN\0"
        out.extend_from_slice(&bin);
    }
    Ok(out)
}

#[cfg(test)]
mod pruebas {
    use super::*;

    /// Un paquete con un triángulo indexado, un grupo raíz con un hijo malla y una luz.
    fn paquete() -> Vec<u8> {
        let mut p = Vec::new();
        let u = |p: &mut Vec<u8>, v: u32| p.extend_from_slice(&v.to_le_bytes());
        let cab = br#""asset":{"version":"2.0"},"materials":[{"name":"m"}]"#;
        let txt = br#""name":"raiz""name":"tri""name":"Luz_1""name":"malla""#;
        for v in [MAGIA, 1, 3, 1, 1, 2] {
            u(&mut p, v);
        }
        u(&mut p, cab.len() as u32);
        p.extend_from_slice(cab);
        while p.len() % 4 != 0 {
            p.push(0);
        }
        // nodos: raíz (sin matriz), malla (con matriz), luz
        for v in [-1i32 as u32, -1i32 as u32, -1i32 as u32, 0, 0, 13] {
            u(&mut p, v);
        }
        for v in [0, 0, -1i32 as u32, 1, 13, 12] {
            u(&mut p, v);
        }
        for v in [0, -1i32 as u32, 0, 0, 25, 14] {
            u(&mut p, v);
        }
        while p.len() % 8 != 0 {
            p.push(0);
        }
        for n in 0..3 {
            for k in 0..16 {
                let v: f64 = if k % 5 == 0 { 1.0 } else if k == 12 && n == 1 { 2.5 } else { 0.0 };
                p.extend_from_slice(&v.to_le_bytes());
            }
        }
        u(&mut p, txt.len() as u32);
        p.extend_from_slice(txt);
        while p.len() % 4 != 0 {
            p.push(0);
        }
        for v in [0, 0, 39, 14] {
            u(&mut p, v);
        }
        for v in [0, 2, 1, 3, 36] {
            u(&mut p, v);
        }
        for v in [0, 3, 3, 0] {
            u(&mut p, v);
        }
        for v in [1, 3, 3, 0] {
            u(&mut p, v);
        }
        let pos: [f32; 9] = [0., 0., 0., 1., 0., 0., 0., 0., 2.];
        let mut datos = Vec::new();
        for f in pos {
            datos.extend_from_slice(&f.to_le_bytes());
        }
        for i in [0u16, 1, 2, 0] {
            datos.extend_from_slice(&i.to_le_bytes());
        }
        u(&mut p, datos.len() as u32);
        p.extend_from_slice(&datos);
        p
    }

    #[test]
    fn glb_valido() {
        let g = crear(&paquete()).expect("glb");
        assert_eq!(&g[0..4], b"glTF");
        assert_eq!(u32::from_le_bytes([g[8], g[9], g[10], g[11]]) as usize, g.len());
        let lj = u32::from_le_bytes([g[12], g[13], g[14], g[15]]) as usize;
        assert_eq!(lj % 4, 0);
        let json = core::str::from_utf8(&g[20..20 + lj]).unwrap();
        assert!(json.contains(r#""scenes":[{"nodes":[0]}]"#), "{json}");
        assert!(json.contains(r#"{"name":"raiz","children":[1,2]}"#), "{json}");
        assert!(json.contains(r#""matrix":[1,0,0,0,0,1,0,0,0,0,1,0,2.5,0,0,1],"mesh":0"#), "{json}");
        assert!(json.contains(r#""extensions":{"KHR_lights_punctual":{"light":0}}"#), "{json}");
        assert!(json.contains(r#""max":[1,0,2],"min":[0,0,0]"#), "{json}");
        assert!(json.contains(r#""componentType":5123,"count":3"#), "{json}");
        assert!(json.contains(r#""indices":2,"material":0}],"name":"malla""#), "{json}");
        assert!(json.contains(r#""NORMAL":1"#) && json.contains(r#""max":[1,1,1],"min":[0,0,0]"#), "normales normalizadas: {json}");
        let bin_len = u32::from_le_bytes([g[20 + lj], g[21 + lj], g[22 + lj], g[23 + lj]]) as usize;
        assert_eq!(bin_len, 36 + 36 + 8); // posiciones, normales y 6 bytes de índices rellenados a 8
        assert_eq!(&g[24 + lj..28 + lj], b"BIN\0");
    }

    #[test]
    fn rechaza_paquetes_rotos() {
        let p = paquete();
        assert_eq!(crear(&p[..10]).unwrap_err(), Fallo::Corto);
        let mut q = p.clone();
        q[0] = 0;
        assert_eq!(crear(&q).unwrap_err(), Fallo::Magia);
        for corte in (0..p.len()).step_by(7) {
            let _ = crear(&p[..corte]); // nunca debe entrar en pánico
        }
    }
}
