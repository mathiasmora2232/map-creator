# Biblioteca de assets del sistema

Cada `.glb` de esta carpeta se publica en la biblioteca de Map Creator para todos los usuarios al arrancar el servidor
(se actualiza si cambia). Para hacer crecer la biblioteca: añade modelos aquí y reinicia.

Opcional: un `.json` con el mismo nombre que el modelo, con sus datos:

```json
{ "nombre": "Banca de parque", "descripcion": "Banca de madera con patas de hierro", "categoria": "urbanismo",
  "etiquetas": ["banca", "parque", "exterior"], "escala": 1, "tamano_m": [1.8, 0.9, 0.6] }
```

Sin `.json`, el nombre sale del archivo y el tamaño se calcula del propio modelo. En producción la carpeta se puede cambiar con
`OO_DIR_BIBLIOTECA` (por ejemplo, un volumen montado).
