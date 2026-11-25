//! Texturas procedurales que se repiten sin costura (ruido periódico): detalle del suelo del terreno (grano que multiplica el color de
//! cada zona + su mapa de normales) y ondas del agua (mapa de normales). RGBA de 8 bits, `tam` × `tam` píxeles.

/// Ruido de gradiente periódico: se repite cada `periodo` celdas en x y en y.
struct Periodico {
    p: [u8; 512],
}

impl Periodico {
    fn nuevo(semilla: u64) -> Periodico {
        let mut perm: [u8; 256] = core::array::from_fn(|i| i as u8);
        let mut s = semilla ^ 0x2545_F491_4F6C_DD1D;
        for i in (1..256).rev() {
            s ^= s << 13;
            s ^= s >> 7;
            s ^= s << 17;
            let j = (s % (i as u64 + 1)) as usize;
            perm.swap(i, j);
        }
        let mut p = [0u8; 512];
        for i in 0..512 {
            p[i] = perm[i & 255];
        }
        Periodico { p }
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
    fn en(&self, x: f64, y: f64, periodo: usize) -> f64 {
        let per = periodo.max(1) as i64;
        let (xf, yf) = (x.floor(), y.floor());
        let (x0, y0) = ((xf as i64).rem_euclid(per), (yf as i64).rem_euclid(per));
        let (x1, y1) = ((x0 + 1) % per, (y0 + 1) % per);
        let (dx, dy) = (x - xf, y - yf);
        let s = |t: f64| t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
        let (u, v) = (s(dx), s(dy));
        let h = |a: i64, b: i64| self.p[self.p[(a & 255) as usize] as usize + (b & 255) as usize];
        let l = |a: f64, b: f64, t: f64| a + (b - a) * t;
        let a = l(Self::grad(h(x0, y0), dx, dy), Self::grad(h(x1, y0), dx - 1.0, dy), u);
        let b = l(Self::grad(h(x0, y1), dx, dy - 1.0), Self::grad(h(x1, y1), dx - 1.0, dy - 1.0), u);
        l(a, b, v)
    }
    /// fBm periódico en [0, 1)²: `celdas` celdas en la primera octava, el doble en cada siguiente
    fn fbm(&self, u: f64, v: f64, celdas: usize, octavas: u32, persistencia: f64) -> f64 {
        let (mut a, mut s, mut n, mut c) = (1.0, 0.0, 0.0, celdas.max(1));
        for _ in 0..octavas {
            s += a * self.en(u * c as f64, v * c as f64, c);
            n += a;
            a *= persistencia;
            c *= 2;
        }
        s / n
    }
}

pub enum Tipo {
    /// grano del suelo: color (gris alrededor de 0,95 que multiplica la zona) y normales
    Suelo,
    /// ondas del agua: solo normales (el color es plano)
    Agua,
}

pub struct Texturas {
    pub color: Vec<u8>,
    pub normal: Vec<u8>,
}

/// `tam` se ajusta a una potencia de dos entre 16 y 2048.
pub fn generar(tam: usize, semilla: u64, tipo: Tipo) -> Texturas {
    let tam = tam.clamp(16, 2048).next_power_of_two();
    let r = Periodico::nuevo(semilla);
    let r2 = Periodico::nuevo(semilla.wrapping_add(77));
    let n = tam * tam;
    let mut h = vec![0f64; n];
    for j in 0..tam {
        for i in 0..tam {
            let (u, v) = (i as f64 / tam as f64, j as f64 / tam as f64);
            h[j * tam + i] = match tipo {
                // grano fino + manchas suaves + algún guijarro
                Tipo::Suelo => {
                    let manchas = r.fbm(u, v, 4, 3, 0.5);
                    let grano = r2.fbm(u, v, 32, 3, 0.55);
                    let piedras = (r.en(u * 24.0 + 3.0, v * 24.0 + 7.0, 24).max(0.0) * 3.0).powi(3).min(1.0);
                    0.55 * manchas + 0.35 * grano + 0.25 * piedras
                }
                // ondas largas cruzadas + rizo
                Tipo::Agua => 0.6 * r.fbm(u, v, 3, 3, 0.5) + 0.4 * r2.fbm(u, v, 12, 3, 0.5),
            };
        }
    }
    let mut color = vec![255u8; n * 4];
    let mut normal = vec![255u8; n * 4];
    let fuerza = match tipo {
        Tipo::Suelo => 7.0,
        Tipo::Agua => 4.0,
    } * tam as f64 / 256.0;
    for j in 0..tam {
        for i in 0..tam {
            let k = j * tam + i;
            let at = |a: usize, b: usize| h[(b % tam) * tam + (a % tam)];
            let dx = (at(i + 1, j) - at(i + tam - 1, j)) * 0.5 * fuerza;
            let dy = (at(i, j + 1) - at(i, j + tam - 1)) * 0.5 * fuerza;
            let len = (dx * dx + dy * dy + 1.0).sqrt();
            let (nx, ny, nz) = (-dx / len, -dy / len, 1.0 / len);
            normal[k * 4] = ((nx * 0.5 + 0.5) * 255.0).round() as u8;
            normal[k * 4 + 1] = ((ny * 0.5 + 0.5) * 255.0).round() as u8;
            normal[k * 4 + 2] = ((nz * 0.5 + 0.5) * 255.0).round() as u8;
            if let Tipo::Suelo = tipo {
                let g = ((0.93 + 0.16 * h[k]).clamp(0.6, 1.15) / 1.15 * 255.0).round() as u8;
                color[k * 4] = g;
                color[k * 4 + 1] = g;
                color[k * 4 + 2] = g;
            }
        }
    }
    Texturas { color, normal }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn se_repite_sin_costura_y_es_determinista() {
        let t = generar(64, 3, Tipo::Suelo);
        assert_eq!(t.color.len(), 64 * 64 * 4);
        assert_eq!(generar(64, 3, Tipo::Suelo).normal, t.normal);
        // la columna 0 y la 63 son vecinas al repetir: la diferencia tiene que ser como entre dos columnas cualesquiera
        let col = |i: usize| (0..64).map(|j| t.color[(j * 64 + i) * 4] as i32).collect::<Vec<_>>();
        let dif = |a: &Vec<i32>, b: &Vec<i32>| a.iter().zip(b).map(|(x, y)| (x - y).abs()).sum::<i32>();
        let costura = dif(&col(63), &col(0));
        let normal = dif(&col(31), &col(32));
        assert!(costura < normal * 3 + 64, "costura {costura} frente a {normal}");
        // normales válidas: z siempre hacia fuera
        assert!(t.normal.chunks(4).all(|p| p[2] >= 128));
    }

    #[test]
    fn agua_y_tamanos() {
        let a = generar(100, 1, Tipo::Agua);
        assert_eq!(a.normal.len(), 128 * 128 * 4); // se sube a potencia de dos
        assert!(a.color.iter().all(|&v| v == 255));
    }
}
