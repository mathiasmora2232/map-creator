//! Motor de Map Creator: lo que en el editor es cálculo puro y pesa con mapas grandes, en Rust → WebAssembly.
//!
//! Interfaz C mínima (sin wasm-bindgen): el editor (`editor/src/nucleo/motor.ts`) reserva memoria con `reservar`, copia los
//! bytes, llama a la función y libera con `liberar`. Si el .wasm no carga, el editor usa su versión en TypeScript.
//!
//! - CRC-32 para el ZIP de las exportaciones a Unity y Godot.
//! - Escritor de GLB (`glb.rs`): de un paquete con la escena ya recorrida al archivo .glb.
//! - Terreno procedural (`procedural.rs`): relieve, erosión, zonas y vegetación.
//! - Texturas que se repiten sin costura (`textura.rs`): grano y relieve del suelo, ondas del agua.

mod crc;
pub mod glb;
pub mod procedural;
pub mod textura;

pub use crc::crc32;

/// Versión de la interfaz: el editor comprueba que coincide antes de usar el motor.
pub const VERSION: u32 = 4;

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

/// Último GLB creado (lo lee el editor con `glb_ptr`/`glb_len` y lo suelta con `glb_soltar`).
static mut ULTIMO_GLB: Vec<u8> = Vec::new();

/// Crea un GLB a partir de un paquete «OOGB» (ver `glb.rs`). Devuelve 0 si fue bien o el código de `glb::Fallo`.
///
/// # Safety
/// `p..p+n` tiene que ser memoria válida del módulo (reservada con `reservar`).
#[no_mangle]
pub unsafe extern "C" fn glb_crear(p: *const u8, n: usize) -> u32 {
    let paquete = core::slice::from_raw_parts(p, n);
    match glb::crear(paquete) {
        Ok(v) => {
            *core::ptr::addr_of_mut!(ULTIMO_GLB) = v;
            0
        }
        Err(e) => e as u32,
    }
}

#[no_mangle]
pub unsafe extern "C" fn glb_ptr() -> *const u8 {
    (*core::ptr::addr_of!(ULTIMO_GLB)).as_ptr()
}

#[no_mangle]
pub unsafe extern "C" fn glb_len() -> usize {
    (*core::ptr::addr_of!(ULTIMO_GLB)).len()
}

#[no_mangle]
pub unsafe extern "C" fn glb_soltar() {
    *core::ptr::addr_of_mut!(ULTIMO_GLB) = Vec::new();
}

/// Último terreno generado (alturas, zonas y plantas); lo leen `terreno_*` y lo suelta `terreno_soltar`.
static mut ULTIMO_TERRENO: Option<procedural::Resultado> = None;

/// Genera un terreno. `params`: 18 f64 (ver `procedural::parametros_de`); `mascara`: nx·nz bytes, 1 = protegido.
/// Devuelve 0 si fue bien, 1 si los parámetros no valen, 2 si la máscara no mide nx·nz.
///
/// # Safety
/// Los punteros tienen que ser memoria válida del módulo (reservada con `reservar`).
#[no_mangle]
pub unsafe extern "C" fn terreno_generar(params: *const f64, n_params: usize, mascara: *const u8, n_mascara: usize) -> u32 {
    let v = core::slice::from_raw_parts(params, n_params);
    let Some(p) = procedural::parametros_de(v) else { return 1 };
    if n_mascara != p.nx * p.nz {
        return 2;
    }
    let m: Vec<bool> = core::slice::from_raw_parts(mascara, n_mascara).iter().map(|&b| b != 0).collect();
    *core::ptr::addr_of_mut!(ULTIMO_TERRENO) = Some(procedural::generar(&p, &m));
    0
}

unsafe fn terreno() -> Option<&'static procedural::Resultado> {
    (*core::ptr::addr_of!(ULTIMO_TERRENO)).as_ref()
}

#[no_mangle]
pub unsafe extern "C" fn terreno_alturas() -> *const f32 {
    terreno().map_or(core::ptr::null(), |t| t.alturas.as_ptr())
}

#[no_mangle]
pub unsafe extern "C" fn terreno_zonas() -> *const u8 {
    terreno().map_or(core::ptr::null(), |t| t.zonas.as_ptr())
}

#[no_mangle]
pub unsafe extern "C" fn terreno_plantas() -> *const f32 {
    terreno().map_or(core::ptr::null(), |t| t.plantas.as_ptr())
}

/// Número de plantas (cada una son 3 f32: x, z, tipo).
#[no_mangle]
pub unsafe extern "C" fn terreno_n_plantas() -> usize {
    terreno().map_or(0, |t| t.plantas.len() / 3)
}

#[no_mangle]
pub unsafe extern "C" fn terreno_soltar() {
    *core::ptr::addr_of_mut!(ULTIMO_TERRENO) = None;
}

static mut ULTIMA_TEXTURA: Option<textura::Texturas> = None;

/// Genera una textura (tipo 0 = suelo, 1 = agua) de `tam` píxeles (potencia de dos entre 16 y 2048). Devuelve el tamaño real.
#[no_mangle]
pub unsafe extern "C" fn textura_generar(tam: usize, semilla: u32, tipo: u32) -> usize {
    let t = textura::generar(tam, semilla as u64, if tipo == 1 { textura::Tipo::Agua } else { textura::Tipo::Suelo });
    let lado = ((t.color.len() / 4) as f64).sqrt() as usize;
    *core::ptr::addr_of_mut!(ULTIMA_TEXTURA) = Some(t);
    lado
}

#[no_mangle]
pub unsafe extern "C" fn textura_color() -> *const u8 {
    (*core::ptr::addr_of!(ULTIMA_TEXTURA)).as_ref().map_or(core::ptr::null(), |t| t.color.as_ptr())
}

#[no_mangle]
pub unsafe extern "C" fn textura_normal() -> *const u8 {
    (*core::ptr::addr_of!(ULTIMA_TEXTURA)).as_ref().map_or(core::ptr::null(), |t| t.normal.as_ptr())
}

#[no_mangle]
pub unsafe extern "C" fn textura_soltar() {
    *core::ptr::addr_of_mut!(ULTIMA_TEXTURA) = None;
}
