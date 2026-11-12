/* Globales del editor. El editor son scripts clásicos (sin import/export) que se comparten objetos por window.OO*, y three.js r147
   llega por CDN como THREE. Aquí se declaran para que tsc los conozca.
   - Los interfaces de DOM se abren con [k: string]: any porque el código guarda datos propios en elementos y eventos
     (el.__dato, e.__manejado…). Al ir tipando módulos, conviene cerrar esto poco a poco. */
declare const THREE: any;
declare var L: any;
interface Window { [k: string]: any }
interface EventTarget { [k: string]: any }
interface Element { [k: string]: any }
interface Event { [k: string]: any }
/** Recorrido guiado del sitio (sitio/src/recorrido.ts → /sitio/js/recorrido.js, lo carga nube.ts a demanda). */
declare var MCRecorrido: { iniciar(pasos: any[], opciones?: { textoFin?: string; alTerminar?: (completo: boolean) => void }): { cerrar(): void } | undefined } | undefined;
declare var __editor: any;
declare var OO: any;
declare var OOAmbiente: any;
declare var OOAnclajes: any;
declare var OOAsas: any;
declare var OOAvisoRecarga: any;
declare var OOCaminar: any;
declare var OOCapasVista: any;
declare var OOCaras: any;
declare var OOCargar: any;
declare var OOCartel: any;
declare var OOCartelesEnviados: any;
declare var OOCatalogoPro: any;
declare var OOCatalogoUI: any;
declare var OOComportamientos: any;
declare var OOCuartos: any;
declare var OOCubiertasL: any;
declare var OODestruccion: any;
declare var OOEditor: any;
declare var OOEntidades: any;
declare var OOEscaleras: any;
declare var OOEscalerasLibres: any;
declare var OOEscalerasPasos: any;
declare var OOEscalerasPro: any;
declare var OOExportar: any;
declare var OOFundaciones: any;
declare var OOGeometria: any;
declare var OOGuiasAlineacion: any;
declare var OOGuiasBorrar: any;
declare var OOHabitaciones: any;
declare var OOHuecos: any;
declare var OOHuecosLosas: any;
declare var OOHuecosPared: any;
declare var OOIman: any;
declare var OOImportados: any;
declare var OOImportarPro: any;
declare var OOJerarquia: any;
declare var OOJerarquiaPro: any;
declare var OOJuegoUnity: any;
declare var OOKits: any;
declare var OOLuces: any;
declare var OOMallas: any;
declare var OOMapaSat: any;
declare var OOMapasNuevos: any;
declare var OOMateriales: any;
declare var OOMatPro: any;
declare var OOModelos: any;
declare var OONiveles: any;
declare var OONotas: any;
declare var OONotasEditor: any;
declare var OONube: any;
declare var OOParedes: any;
declare var OOPiezas: any;
declare var OOPlano: any;
declare var OOPlataformas: any;
declare var OOPrefabs: any;
declare var OOPrefabsProc: any;
declare var OOPresetsMuro: any;
declare var OOProductividad: any;
declare var OORevestimientos: any;
declare var OOSeleccionMultiple: any;
declare var OOTechos: any;
declare var OOTerreno: any;
declare var OOTerrenoPro: any;
declare var OOTexturas: any;
declare var OOTransformar: any;
declare var OOUI: any;
declare var OOValidacion: any;
declare var OOVegetacion: any;
declare var OOVersionMapa: any;
declare var OOVistasRender: any;
declare var OOZonas: any;
declare var OOMaterialesPro: any;
