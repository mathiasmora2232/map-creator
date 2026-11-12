/* Segundo paso de la migración del editor (también de un solo uso): por cada error «la propiedad X no existe en el tipo {…}»
   sobre un objeto declarado con `const|let x = {…}`, anota la declaración como `x: any` (el código añade propiedades después).
   Uso: node scripts/migrar-ts-paso2.mjs <tsconfig.json> */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const cfgPath = path.resolve(process.argv[2]);
const cfg = ts.parseJsonConfigFileContent(ts.readConfigFile(cfgPath, ts.sys.readFile).config, ts.sys, path.dirname(cfgPath));
for (let vuelta = 0; vuelta < 4; vuelta++) {
  const prog = ts.createProgram(cfg.fileNames, cfg.options), chk = prog.getTypeChecker();
  const porArchivo = new Map();
  for (const d of ts.getPreEmitDiagnostics(prog)) {
    if (!d.file || ![2339, 2551, 2353].includes(d.code)) continue;
    let n = ts.getTokenAtPosition ? ts.getTokenAtPosition(d.file, d.start) : null;
    if (!n) { const busca = x => (d.start >= x.getStart(d.file) && d.start < x.getEnd() ? (ts.forEachChild(x, busca) || x) : undefined); n = busca(d.file); }
    while (n && !ts.isPropertyAccessExpression(n) && !ts.isObjectLiteralExpression(n)) n = n.parent;
    if (!n) continue;
    let base = ts.isPropertyAccessExpression(n) ? n.expression : n;
    const sim = ts.isIdentifier(base) ? chk.getSymbolAtLocation(base) : null;
    const dec = sim && sim.valueDeclaration;
    let objetivo = null;
    if (dec && (ts.isVariableDeclaration(dec) || ts.isParameter(dec)) && !dec.type && ts.isIdentifier(dec.name)) objetivo = dec.name;
    else if (ts.isObjectLiteralExpression(n) && ts.isVariableDeclaration(n.parent) && !n.parent.type) objetivo = n.parent.name;
    if (!objetivo) continue;
    const sf = objetivo.getSourceFile(); const set = porArchivo.get(sf.fileName) || new Set(); set.add(objetivo.getEnd()); porArchivo.set(sf.fileName, set);
  }
  if (!porArchivo.size) break;
  for (const [f, pos] of porArchivo) {
    let t = fs.readFileSync(f, 'utf8');
    for (const p of [...pos].sort((a, b) => b - a)) { const sig = t.slice(p, p + 2); t = t.slice(0, p) + (sig.startsWith('?') ? '' : ': any') + t.slice(p); }
    fs.writeFileSync(f, t);
  }
  console.log('vuelta', vuelta + 1, ':', [...porArchivo.values()].reduce((s, x) => s + x.size, 0), 'declaraciones anotadas');
}
