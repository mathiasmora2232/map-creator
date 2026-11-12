//! CRC-32 IEEE (polinomio reflejado 0xEDB88320), «slicing-by-8»: procesa 8 bytes por vuelta con 8 tablas calculadas al
//! compilar. Unas 5-8 veces más rápido que el byte a byte que tenía el editor en JavaScript.

const POLI: u32 = 0xEDB8_8320;

const fn tablas() -> [[u32; 256]; 8] {
    let mut t = [[0u32; 256]; 8];
    let mut n = 0;
    while n < 256 {
        let mut c = n as u32;
        let mut k = 0;
        while k < 8 {
            c = if c & 1 != 0 { POLI ^ (c >> 1) } else { c >> 1 };
            k += 1;
        }
        t[0][n] = c;
        n += 1;
    }
    let mut n = 0;
    while n < 256 {
        let mut s = 1;
        while s < 8 {
            let prev = t[s - 1][n];
            t[s][n] = (prev >> 8) ^ t[0][(prev & 0xFF) as usize];
            s += 1;
        }
        n += 1;
    }
    t
}

static T: [[u32; 256]; 8] = tablas();

/// CRC-32 de todo `datos`.
pub fn crc32(datos: &[u8]) -> u32 {
    !actualizar(!0, datos)
}

/// Sigue un CRC (sin la inversión final) con más bytes.
fn actualizar(mut c: u32, datos: &[u8]) -> u32 {
    let mut trozos = datos.chunks_exact(8);
    for b in &mut trozos {
        let a = c ^ u32::from_le_bytes([b[0], b[1], b[2], b[3]]);
        c = T[7][(a & 0xFF) as usize]
            ^ T[6][((a >> 8) & 0xFF) as usize]
            ^ T[5][((a >> 16) & 0xFF) as usize]
            ^ T[4][(a >> 24) as usize]
            ^ T[3][b[4] as usize]
            ^ T[2][b[5] as usize]
            ^ T[1][b[6] as usize]
            ^ T[0][b[7] as usize];
    }
    for &b in trozos.remainder() {
        c = T[0][((c ^ b as u32) & 0xFF) as usize] ^ (c >> 8);
    }
    c
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn lento(d: &[u8]) -> u32 {
        let mut c = !0u32;
        for &b in d {
            c ^= b as u32;
            for _ in 0..8 {
                c = if c & 1 != 0 { POLI ^ (c >> 1) } else { c >> 1 };
            }
        }
        !c
    }

    #[test]
    fn valores_conocidos() {
        assert_eq!(crc32(b""), 0);
        assert_eq!(crc32(b"123456789"), 0xCBF4_3926);
        assert_eq!(crc32(b"The quick brown fox jumps over the lazy dog"), 0x414F_A339);
    }

    #[test]
    fn igual_que_byte_a_byte_en_todos_los_tamanos() {
        let d: Vec<u8> = (0..5000u32).map(|i| (i.wrapping_mul(2654435761) >> 13) as u8).collect();
        for n in [0, 1, 7, 8, 9, 15, 16, 17, 63, 64, 65, 1000, 4999, 5000] {
            assert_eq!(crc32(&d[..n]), lento(&d[..n]), "n = {n}");
        }
    }
}
