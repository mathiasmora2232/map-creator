//! Motor de Map Creator: lo que en el editor es cálculo puro y pesa con mapas grandes, en Rust → WebAssembly.
//!
//! Interfaz C mínima (sin wasm-bindgen): el editor (`editor/src/nucleo/motor.ts`) reserva memoria con `reservar`, copia los
//! bytes, llama a la función y libera con `liberar`. Si el .wasm no carga, el editor usa su versión en TypeScript.
//!
//! Primer paso: CRC-32 para el ZIP de las exportaciones a Unity y Godot (el .glb y el JSON de un mapa grande son ~20 MB).

mod crc;

pub use crc::crc32;

/// Versión de la interfaz: el editor comprueba que coincide antes de usar el motor.
pub const VERSION: u32 = 1;

#[no_mangle]
pub extern "C" fn version() -> u32 {
    VERSION
}

/// Reserva `n` bytes en la memoria del módulo y devuelve el puntero (lo libera `liberar` con el mismo `n`).
#[no_mangle]
pub extern "C" fn reservar(n: usize) -> *mut u8 {
    let mut v = Vec::<u8>::with_capacity(n.max(1));
    let p = v.as_mut_ptr();
    core::mem::forget(v);
    p
}

/// Libera lo reservado con `reservar(n)`.
///
/// # Safety
/// `p` tiene que venir de `reservar(n)` con el mismo `n` y no usarse después.
#[no_mangle]
pub unsafe extern "C" fn liberar(p: *mut u8, n: usize) {
    drop(Vec::from_raw_parts(p, 0, n.max(1)));
}

/// CRC-32 (el de ZIP y PNG) de `n` bytes en `p`.
///
/// # Safety
/// `p..p+n` tiene que ser memoria válida del módulo (reservada con `reservar`).
#[no_mangle]
pub unsafe extern "C" fn crc32_bytes(p: *const u8, n: usize) -> u32 {
    if n == 0 {
        return 0;
    }
    crc32(core::slice::from_raw_parts(p, n))
}
