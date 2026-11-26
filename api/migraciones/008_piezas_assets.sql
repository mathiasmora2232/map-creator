-- Modelos hechos con piezas (creador de assets y crear_modelo): se guardan las piezas para poder volver a abrirlos y editarlos.
ALTER TABLE biblioteca_assets ADD COLUMN piezas jsonb;
