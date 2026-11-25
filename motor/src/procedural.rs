//! Terreno procedural: relieve, erosión, zonas (agua, arena, césped, bosque, tierra, roca, nieve) y puntos de vegetación.
//!
//! Trabaja sobre la rejilla del terreno del editor (`editor/src/mapa/terreno.ts`: nx × nz celdas de `paso` metros, filas de z y
//! en cada fila x creciente). Una máscara marca las celdas protegidas (lo construido del mapa): ahí la altura queda en 0 y sin
//! pintar, y el relieve sube con una transición suave alrededor, así nada flota ni queda enterrado.
//!
//! Todo es determinista para una semilla: la misma entrada da exactamente el mismo terreno.

/// Zonas (índices de `Resultado::zonas`). `SIN_PINTAR` = celda protegida.
pub const AGUA: u8 = 0;
pub const ARENA: u8 = 1;
pub const CESPED: u8 = 2;
pub const BOSQUE: u8 = 3;
pub const TIERRA: u8 = 4;
pub const ROCA: u8 = 5;
pub const NIEVE: u8 = 6;
pub const SIN_PINTAR: u8 = 255;

/// Tipos de planta de `Resultado::plantas`.
pub const ARBOL: u8 = 0;
pub const ARBUSTO: u8 = 1;
pub const PALMERA: u8 = 2;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Estilo {
    Llanura,
    Colinas,
    Montanas,
    Valle,
    Isla,
    Dunas,
}

impl Estilo {
    pub fn de(n: u32) -> Estilo {
        match n {
            1 => Estilo::Colinas,
            2 => Estilo::Montanas,
            3 => Estilo::Valle,
            4 => Estilo::Isla,
            5 => Estilo::Dunas,
            _ => Estilo::Llanura,
        }
    }
}

#[derive(Clone, Debug)]
pub struct Parametros {
    pub nx: usize,
    pub nz: usize,
    /// metros por celda
    pub paso: f64,
    pub x0: f64,
    pub z0: f64,
    pub semilla: u64,
    pub estilo: Estilo,
    /// amplitud del relieve en metros
    pub altura: f64,
    /// tamaño típico de las formas en metros (colinas, montañas)
    pub escala: f64,
    /// 0 = suave, 1 = muy accidentado
    pub rugosidad: f64,
    /// 0 = sin erosión, 1 = mucha
    pub erosion: f64,
    /// altura del agua en metros (debe ser negativa: el mapa está en 0 y queda seco)
    pub nivel_agua: f64,
    /// -1 = desierto, 0 = normal, 1 = muy húmedo (más bosque)
    pub humedad: f64,
    /// plantas por 100 m² en el bosque (0 = sin vegetación)
    pub densidad: f64,
    /// metros de transición entre lo protegido (altura 0) y el relieve
    pub transicion: f64,
    /// altura desde la que hay nieve (0 = sin nieve)
    pub nieve: f64,
    /// río que cruza el terreno
    pub rio: bool,
    /// ancho del río en metros
    pub ancho_rio: f64,
}

pub struct Resultado {
    pub alturas: Vec<f32>,
    pub zonas: Vec<u8>,
    /// tríos (x, z, tipo) en coordenadas del mapa
    pub plantas: Vec<f32>,
}

// ───────────── azar con semilla ─────────────

struct Azar(u64);
impl Azar {
    fn nuevo(s: u64) -> Azar {
        Azar(s ^ 0x9E37_79B9_7F4A_7C15)
    }
    fn u64(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }
    /// [0, 1)
    fn f(&mut self) -> f64 {
        (self.u64() >> 11) as f64 / (1u64 << 53) as f64
    }
}

// ───────────── ruido de gradiente (Perlin mejorado) ─────────────

struct Ruido {
    p: [u8; 512],
}

impl Ruido {
    fn nuevo(semilla: u64) -> Ruido {
        let mut perm: [u8; 256] = core::array::from_fn(|i| i as u8);
        let mut r = Azar::nuevo(semilla);
        for i in (1..256).rev() {
            let j = (r.u64() % (i as u64 + 1)) as usize;
            perm.swap(i, j);
        }
        let mut p = [0u8; 512];
        for i in 0..512 {
            p[i] = perm[i & 255];
        }
        Ruido { p }
    }
    fn grad(h: u8, x: f64, y: f64) -> f64 {
        match h & 7 {
            0 => x + y,
            1 => -x + y,
            2 => x - y,
            3 => -x - y,
            4 => x,
            5 => -x,
            6 => y,
            _ => -y,
        }
    }
    /// aproximadamente en [-1, 1]
    fn en(&self, x: f64, y: f64) -> f64 {
        let (xf, yf) = (x.floor(), y.floor());
        let (xi, yi) = ((xf as i64 & 255) as usize, (yf as i64 & 255) as usize);
        let (dx, dy) = (x - xf, y - yf);
        let s = |t: f64| t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
        let (u, v) = (s(dx), s(dy));
        let p = &self.p;
        let (aa, ab) = (p[p[xi] as usize + yi], p[p[xi] as usize + yi + 1]);
        let (ba, bb) = (p[p[xi + 1] as usize + yi], p[p[xi + 1] as usize + yi + 1]);
        let l = |a: f64, b: f64, t: f64| a + (b - a) * t;
        let x1 = l(Self::grad(aa, dx, dy), Self::grad(ba, dx - 1.0, dy), u);
        let x2 = l(Self::grad(ab, dx, dy - 1.0), Self::grad(bb, dx - 1.0, dy - 1.0), u);
        l(x1, x2, v) * 0.97
    }
    /// fBm normalizado a [-1, 1]
    fn fbm(&self, x: f64, y: f64, octavas: u32, persistencia: f64) -> f64 {
        let (mut a, mut f, mut s, mut n) = (1.0, 1.0, 0.0, 0.0);
        for o in 0..octavas {
            s += a * self.en(x * f + o as f64 * 17.13, y * f - o as f64 * 9.71);
            n += a;
            a *= persistencia;
            f *= 2.03;
        }
        s / n
    }
    /// crestas (montañas): [0, 1], picos afilados
    fn crestas(&self, x: f64, y: f64, octavas: u32, persistencia: f64) -> f64 {
        let (mut a, mut f, mut s, mut n, mut peso) = (1.0, 1.0, 0.0, 0.0, 1.0f64);
        for o in 0..octavas {
            let mut v = 1.0 - self.en(x * f + o as f64 * 31.7, y * f + o as f64 * 3.3).abs();
            v *= v;
            v *= peso;
            peso = (v * 2.0).clamp(0.0, 1.0);
            s += a * v;
            n += a;
            a *= persistencia;
            f *= 2.01;
        }
        s / n
    }
}

fn suave(a: f64, b: f64, x: f64) -> f64 {
    let t = ((x - a) / (b - a)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

/// Distancia (en celdas) de cada celda a la celda marcada más cercana: chaflán 3-4 en dos pasadas.
fn distancia(marca: &[bool], nx: usize, nz: usize) -> Vec<f32> {
    const INF: f32 = 1e9;
    let mut d: Vec<f32> = marca.iter().map(|&m| if m { 0.0 } else { INF }).collect();
    let (a, b) = (1.0f32, core::f32::consts::SQRT_2);
    for j in 0..nz {
        for i in 0..nx {
            let k = j * nx + i;
            let mut v = d[k];
            if i > 0 {
                v = v.min(d[k - 1] + a);
            }
            if j > 0 {
                v = v.min(d[k - nx] + a);
                if i > 0 {
                    v = v.min(d[k - nx - 1] + b);
                }
                if i + 1 < nx {
                    v = v.min(d[k - nx + 1] + b);
                }
            }
            d[k] = v;
        }
    }
    for j in (0..nz).rev() {
        for i in (0..nx).rev() {
            let k = j * nx + i;
            let mut v = d[k];
            if i + 1 < nx {
                v = v.min(d[k + 1] + a);
            }
            if j + 1 < nz {
                v = v.min(d[k + nx] + a);
                if i + 1 < nx {
                    v = v.min(d[k + nx + 1] + b);
                }
                if i > 0 {
                    v = v.min(d[k + nx - 1] + b);
                }
            }
            d[k] = v;
        }
    }
    d
}

/// Erosión hidráulica por gotas: cada gota baja por la pendiente, arranca sedimento donde va rápida y lo deja donde frena.
/// `h` en unidades normalizadas (≈ 0..1 de la amplitud); `fijo` = celdas que no se tocan.
fn erosionar(h: &mut [f64], fijo: &[bool], nx: usize, nz: usize, gotas: usize, r: &mut Azar) {
    if nx < 3 || nz < 3 {
        return;
    }
    let (inercia, capacidad, min_cap, deposito, arranque, evaporacion, gravedad, pasos) =
        (0.05, 4.0, 0.01, 0.3, 0.3, 0.02, 4.0, 48);
    let altura_grad = |h: &[f64], x: f64, y: f64| -> (f64, f64, f64) {
        let (i, j) = (x as usize, y as usize);
        let (u, v) = (x - i as f64, y - j as f64);
        let k = j * nx + i;
        let (a, b, c, d) = (h[k], h[k + 1], h[k + nx], h[k + nx + 1]);
        let gx = (b - a) * (1.0 - v) + (d - c) * v;
        let gy = (c - a) * (1.0 - u) + (d - b) * u;
        let alt = a * (1.0 - u) * (1.0 - v) + b * u * (1.0 - v) + c * (1.0 - u) * v + d * u * v;
        (alt, gx, gy)
    };
    for _ in 0..gotas {
        let (mut x, mut y) = (r.f() * (nx - 2) as f64, r.f() * (nz - 2) as f64);
        let (mut dx, mut dy, mut vel, mut agua, mut sed) = (0.0f64, 0.0f64, 1.0f64, 1.0f64, 0.0f64);
        for _ in 0..pasos {
            let (i, j) = (x as usize, y as usize);
            let k = j * nx + i;
            let (u, v) = (x - i as f64, y - j as f64);
            let (alt, gx, gy) = altura_grad(h, x, y);
            dx = dx * inercia - gx * (1.0 - inercia);
            dy = dy * inercia - gy * (1.0 - inercia);
            let len = (dx * dx + dy * dy).sqrt();
            if len < 1e-12 {
                break;
            }
            dx /= len;
            dy /= len;
            x += dx;
            y += dy;
            if x < 0.0 || y < 0.0 || x >= (nx - 1) as f64 || y >= (nz - 1) as f64 {
                break;
            }
            let (alt2, _, _) = altura_grad(h, x, y);
            let dh = alt2 - alt;
            let cap = (-dh * vel * agua * capacidad).max(min_cap);
            let pesos = [(k, (1.0 - u) * (1.0 - v)), (k + 1, u * (1.0 - v)), (k + nx, (1.0 - u) * v), (k + nx + 1, u * v)];
            if sed > cap || dh > 0.0 {
                // dejar: si sube, rellena el hueco; si no, la parte que sobra
                let dejar = if dh > 0.0 { dh.min(sed) } else { (sed - cap) * deposito };
                sed -= dejar;
                for (c, w) in pesos {
                    if !fijo[c] {
                        h[c] += dejar * w;
                    }
                }
            } else {
                let quitar = ((cap - sed) * arranque).min(-dh);
                for (c, w) in pesos {
                    if !fijo[c] {
                        h[c] -= quitar * w;
                    }
                }
                sed += quitar;
            }
            vel = (vel * vel + dh.abs() * gravedad).max(0.0).sqrt();
            agua *= 1.0 - evaporacion;
        }
    }
}

/// Genera el terreno. `protegido[k]` = la celda k es del mapa construido.
pub fn generar(p: &Parametros, protegido: &[bool]) -> Resultado {
    let (nx, nz) = (p.nx.max(2), p.nz.max(2));
    let n = nx * nz;
    let paso = if p.paso > 0.0 { p.paso } else { 1.0 };
    let prot: Vec<bool> = (0..n).map(|k| protegido.get(k).copied().unwrap_or(false)).collect();
    let ruido = Ruido::nuevo(p.semilla);
    let ruido_h = Ruido::nuevo(p.semilla.wrapping_mul(31).wrapping_add(7)); // humedad
    let ruido_w = Ruido::nuevo(p.semilla.wrapping_add(1234)); // deformación del dominio
    let mut azar = Azar::nuevo(p.semilla.wrapping_add(99));
    let escala = p.escala.max(5.0);
    let pers = 0.35 + 0.3 * p.rugosidad.clamp(0.0, 1.0);
    let octavas = 4 + (p.rugosidad.clamp(0.0, 1.0) * 3.0) as u32;
    let (ancho_m, largo_m) = ((nx - 1) as f64 * paso, (nz - 1) as f64 * paso);
    // centro de lo protegido (o del terreno): la isla y el valle se ordenan alrededor del mapa
    let (mut cx, mut cz, mut np) = (0.0, 0.0, 0usize);
    for j in 0..nz {
        for i in 0..nx {
            if prot[j * nx + i] {
                cx += i as f64;
                cz += j as f64;
                np += 1;
            }
        }
    }
    let (cx, cz) = if np > 0 { (cx / np as f64 * paso, cz / np as f64 * paso) } else { (ancho_m / 2.0, largo_m / 2.0) };
    let radio = (ancho_m.min(largo_m) / 2.0).max(paso);
    // río: una curva que cruza de oeste a este y pasa al norte o al sur del mapa
    let lado = if azar.f() < 0.5 { -1.0 } else { 1.0 };
    let desv = lado * (0.25 + 0.15 * azar.f()) * largo_m;

    // ── 1. relieve normalizado (≈ -1..1, 1 = amplitud) ──
    let mut h = vec![0.0f64; n];
    for j in 0..nz {
        for i in 0..nx {
            let (x, z) = (i as f64 * paso, j as f64 * paso);
            let (wx, wz) = (
                x + ruido_w.fbm(x / escala * 0.5, z / escala * 0.5, 3, 0.5) * escala * 0.35,
                z + ruido_w.fbm(x / escala * 0.5 + 40.0, z / escala * 0.5 - 40.0, 3, 0.5) * escala * 0.35,
            );
            let (sx, sz) = (wx / escala, wz / escala);
            let f = ruido.fbm(sx, sz, octavas, pers);
            let v = match p.estilo {
                Estilo::Llanura => 0.25 * f,
                Estilo::Colinas => 0.15 + 0.6 * ruido.fbm(sx * 0.7, sz * 0.7, octavas.min(5), pers * 0.8),
                Estilo::Montanas => {
                    let c = ruido.crestas(sx * 0.6, sz * 0.6, octavas + 1, pers + 0.1);
                    1.2 * c.powf(1.6) + 0.15 * f
                }
                Estilo::Valle => {
                    // laderas a los lados de la línea que pasa por el mapa (dirección oeste-este con meandros)
                    let lin = cz + ruido_w.fbm(x / (escala * 2.0), 3.7, 3, 0.5) * escala * 0.8;
                    let t = ((z - lin).abs() / (largo_m * 0.35).max(paso)).min(1.5);
                    0.9 * t.powf(1.4) + 0.25 * f - 0.05
                }
                Estilo::Isla => {
                    let r = ((x - cx).powi(2) + (z - cz).powi(2)).sqrt() / radio;
                    let costa = 0.75 + 0.2 * ruido_w.fbm(x / escala, z / escala, 3, 0.5);
                    0.35 + 0.45 * f - 1.4 * suave(costa * 0.7, costa * 1.15, r)
                }
                Estilo::Dunas => {
                    let a = (wx * 0.8 + wz * 0.6) / (escala * 0.35);
                    let duna = (a.sin() * 0.5 + 0.5).powf(1.8);
                    0.35 * duna + 0.2 * f
                }
            };
            h[j * nx + i] = v;
        }
    }

    // ── 2. erosión (antes de proteger el mapa, que no se toca) ──
    if p.erosion > 0.0 && !matches!(p.estilo, Estilo::Llanura) {
        let gotas = (p.erosion.clamp(0.0, 1.0) * n as f64 * 1.2) as usize;
        erosionar(&mut h, &prot, nx, nz, gotas, &mut azar);
    }

    // ── 3. metros, río y transición con lo protegido ──
    let dist_prot = distancia(&prot, nx, nz);
    let trans = (p.transicion / paso).max(1.0) as f32;
    let agua = p.nivel_agua.min(-0.05);
    let mut alt = vec![0.0f32; n];
    for j in 0..nz {
        for i in 0..nx {
            let k = j * nx + i;
            let mut m = h[k] * p.altura;
            if p.rio {
                let (x, z) = (i as f64 * paso, j as f64 * paso);
                let linea = cz + desv * (0.6 + 0.4 * (x / ancho_m * core::f64::consts::PI * 1.3).sin())
                    + ruido_w.fbm(x / (escala * 1.5), 11.0, 3, 0.5) * escala * 0.6;
                let d = (z - linea).abs();
                let medio = p.ancho_rio.max(paso) / 2.0;
                let fondo = agua - 0.8 - p.ancho_rio * 0.05;
                let w = 1.0 - suave(medio, medio * 2.5 + paso, d);
                m = m * (1.0 - w) + fondo * w;
            }
            let w = if np == 0 { 1.0 } else { suave(0.0, trans as f64, dist_prot[k] as f64) };
            alt[k] = if prot[k] { 0.0 } else { (m * w) as f32 };
        }
    }

    // ── 4. zonas ──
    let agua_m: Vec<bool> = alt.iter().enumerate().map(|(k, &a)| !prot[k] && (a as f64) < agua).collect();
    let dist_agua = distancia(&agua_m, nx, nz);
    let mut zonas = vec![SIN_PINTAR; n];
    let pend = |alt: &[f32], i: usize, j: usize| -> f64 {
        let k = j * nx + i;
        let gx = if i == 0 { alt[k + 1] - alt[k] } else if i + 1 == nx { alt[k] - alt[k - 1] } else { (alt[k + 1] - alt[k - 1]) * 0.5 };
        let gz = if j == 0 { alt[k + nx] - alt[k] } else if j + 1 == nz { alt[k] - alt[k - nx] } else { (alt[k + nx] - alt[k - nx]) * 0.5 };
        ((gx * gx + gz * gz) as f64).sqrt() / paso
    };
    let desierto = matches!(p.estilo, Estilo::Dunas) || p.humedad < -0.5;
    for j in 0..nz {
        for i in 0..nx {
            let k = j * nx + i;
            if prot[k] {
                continue;
            }
            let a = alt[k] as f64;
            if a < agua {
                zonas[k] = AGUA;
                continue;
            }
            let s = pend(&alt, i, j);
            let (x, z) = (i as f64 * paso, j as f64 * paso);
            let cerca_agua = (dist_agua[k] as f64 * paso).min(1e6);
            let hum = ruido_h.fbm(x / (escala * 1.3), z / (escala * 1.3), 4, 0.5) * 0.8 + p.humedad * 0.6
                + 0.5 * (-cerca_agua / 25.0).exp()
                - if p.nieve > 0.0 { (a / p.nieve).clamp(0.0, 1.0) * 0.4 } else { 0.0 };
            zonas[k] = if p.nieve > 0.0 && a > p.nieve && s < 1.4 {
                NIEVE
            } else if s > 0.8 {
                ROCA
            } else if a < agua + 0.9 && cerca_agua < 10.0 {
                ARENA
            } else if desierto {
                if hum > 0.35 { TIERRA } else { ARENA }
            } else if hum > 0.25 {
                BOSQUE
            } else if hum < -0.3 || s > 0.5 {
                TIERRA
            } else {
                CESPED
            };
        }
    }

    // ── 5. vegetación: rejilla con desplazamiento al azar, filtrada por zona ──
    let mut plantas = Vec::new();
    if p.densidad > 0.0 {
        let sep = (10.0 / p.densidad.max(0.05).sqrt()).max(1.2);
        let (mx, mz) = ((ancho_m / sep) as usize + 1, (largo_m / sep) as usize + 1);
        const MAX_PLANTAS: usize = 30_000;
        'fuera: for gj in 0..mz {
            for gi in 0..mx {
                let x = (gi as f64 + azar.f()) * sep;
                let z = (gj as f64 + azar.f()) * sep;
                if x > ancho_m || z > largo_m {
                    continue;
                }
                let (i, j) = (((x / paso).round() as usize).min(nx - 1), ((z / paso).round() as usize).min(nz - 1));
                let k = j * nx + i;
                if prot[k] || (dist_prot[k] as f64) * paso < 3.0 || pend(&alt, i, j) > 0.7 {
                    continue;
                }
                let r = azar.f();
                let tipo = match zonas[k] {
                    BOSQUE if r < 0.85 => ARBOL,
                    BOSQUE if r < 0.95 => ARBUSTO,
                    CESPED if r < 0.06 => ARBOL,
                    CESPED if r < 0.16 => ARBUSTO,
                    TIERRA if r < 0.06 => ARBUSTO,
                    ARENA if r < 0.05 && (dist_agua[k] as f64) * paso < 18.0 => PALMERA,
                    ARENA if desierto && r < 0.015 => ARBUSTO,
                    _ => continue,
                };
                plantas.extend_from_slice(&[(p.x0 + x) as f32, (p.z0 + z) as f32, tipo as f32]);
                if plantas.len() / 3 >= MAX_PLANTAS {
                    break 'fuera;
                }
            }
        }
    }
    Resultado { alturas: alt, zonas, plantas }
}

/// Lee los parámetros del arreglo plano que manda el editor (ver `editor/src/mapa/terreno_procedural.ts`).
pub fn parametros_de(v: &[f64]) -> Option<Parametros> {
    if v.len() < 18 {
        return None;
    }
    let (nx, nz) = (v[0] as usize, v[1] as usize);
    if nx < 2 || nz < 2 || nx > 4096 || nz > 4096 || !(v[2] > 0.0) {
        return None;
    }
    Some(Parametros {
        nx,
        nz,
        paso: v[2],
        semilla: v[3] as u64,
        estilo: Estilo::de(v[4] as u32),
        altura: v[5].clamp(0.0, 500.0),
        escala: v[6].clamp(5.0, 5000.0),
        rugosidad: v[7].clamp(0.0, 1.0),
        erosion: v[8].clamp(0.0, 1.0),
        nivel_agua: v[9].clamp(-200.0, -0.05),
        humedad: v[10].clamp(-1.0, 1.0),
        densidad: v[11].clamp(0.0, 50.0),
        transicion: v[12].clamp(0.0, 1000.0),
        nieve: v[13].clamp(0.0, 1000.0),
        x0: v[14],
        z0: v[15],
        rio: v[16] != 0.0,
        ancho_rio: v[17].clamp(1.0, 200.0),
    })
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn base(estilo: Estilo) -> Parametros {
        Parametros {
            nx: 120, nz: 100, paso: 2.0, x0: -100.0, z0: -80.0, semilla: 7, estilo, altura: 25.0, escala: 60.0, rugosidad: 0.5,
            erosion: 0.4, nivel_agua: -0.5, humedad: 0.0, densidad: 3.0, transicion: 20.0, nieve: 0.0, rio: false, ancho_rio: 8.0,
        }
    }
    fn mascara(p: &Parametros) -> Vec<bool> {
        // un rectángulo en el centro, como un mapa construido
        (0..p.nx * p.nz).map(|k| { let (i, j) = (k % p.nx, k / p.nx); (50..70).contains(&i) && (40..60).contains(&j) }).collect()
    }

    #[test]
    fn determinista_y_sin_nan() {
        for e in [Estilo::Llanura, Estilo::Colinas, Estilo::Montanas, Estilo::Valle, Estilo::Isla, Estilo::Dunas] {
            let p = base(e);
            let m = mascara(&p);
            let a = generar(&p, &m);
            let b = generar(&p, &m);
            assert_eq!(a.alturas, b.alturas, "{e:?}");
            assert_eq!(a.zonas, b.zonas, "{e:?}");
            assert_eq!(a.plantas, b.plantas, "{e:?}");
            assert!(a.alturas.iter().all(|v| v.is_finite()), "{e:?}");
            assert!(a.alturas.iter().all(|v| v.abs() < 200.0), "{e:?}");
            let otra = generar(&Parametros { semilla: 8, ..p.clone() }, &m);
            assert_ne!(a.alturas, otra.alturas, "otra semilla, otro terreno ({e:?})");
        }
    }

    #[test]
    fn lo_protegido_queda_plano_y_sin_pintar() {
        let p = base(Estilo::Montanas);
        let m = mascara(&p);
        let r = generar(&p, &m);
        for k in 0..m.len() {
            if m[k] {
                assert_eq!(r.alturas[k], 0.0);
                assert_eq!(r.zonas[k], SIN_PINTAR);
            }
        }
        // justo al lado del mapa la altura es pequeña (transición suave), lejos puede ser grande
        let borde = 39 * p.nx + 60;
        assert!(r.alturas[borde].abs() < 1.0, "borde {}", r.alturas[borde]);
        // ninguna planta encima del mapa construido
        for t in r.plantas.chunks(3) {
            let (i, j) = (((t[0] as f64 - p.x0) / p.paso).round() as usize, ((t[1] as f64 - p.z0) / p.paso).round() as usize);
            assert!(!m[j * p.nx + i]);
        }
    }

    #[test]
    fn la_isla_tiene_agua_y_playa_y_el_rio_agua() {
        let p = base(Estilo::Isla);
        let r = generar(&p, &mascara(&p));
        let cuenta = |z: u8| r.zonas.iter().filter(|&&v| v == z).count();
        assert!(cuenta(AGUA) > 500, "agua {}", cuenta(AGUA));
        assert!(cuenta(ARENA) > 20, "arena {}", cuenta(ARENA));
        // el agua está bajo el nivel del agua y la tierra por encima
        for k in 0..r.zonas.len() {
            if r.zonas[k] == AGUA {
                assert!((r.alturas[k] as f64) < p.nivel_agua);
            }
        }
        let rio = Parametros { rio: true, ..base(Estilo::Colinas) };
        let rr = generar(&rio, &mascara(&rio));
        assert!(rr.zonas.iter().filter(|&&v| v == AGUA).count() > 100);
    }

    #[test]
    fn montanas_con_nieve_y_roca_dunas_de_arena() {
        let p = Parametros { nieve: 18.0, altura: 40.0, ..base(Estilo::Montanas) };
        let r = generar(&p, &mascara(&p));
        assert!(r.zonas.iter().any(|&z| z == NIEVE));
        assert!(r.zonas.iter().any(|&z| z == ROCA));
        let d = base(Estilo::Dunas);
        let rd = generar(&d, &mascara(&d));
        let arena = rd.zonas.iter().filter(|&&z| z == ARENA).count();
        let pintadas = rd.zonas.iter().filter(|&&z| z != SIN_PINTAR).count();
        assert!(arena * 2 > pintadas, "dunas: {arena} de {pintadas}");
    }

    #[test]
    fn bosque_con_arboles_y_parametros_validos() {
        let p = Parametros { humedad: 0.8, ..base(Estilo::Colinas) };
        let r = generar(&p, &mascara(&p));
        assert!(r.plantas.chunks(3).filter(|t| t[2] as u8 == ARBOL).count() > 50);
        assert!(parametros_de(&[0.0; 5]).is_none());
        let mut v = [0.0; 18];
        v[0] = 10.0; v[1] = 10.0; v[2] = 2.0; v[9] = 5.0; // agua positiva → se baja a -0.05
        assert!(parametros_de(&v).unwrap().nivel_agua < 0.0);
    }
}
