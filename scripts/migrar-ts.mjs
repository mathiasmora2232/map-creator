/* Paso único de la migración del editor a TypeScript (se deja en el repo para que se vea qué se hizo):
   - parámetros sin tipo ni valor por defecto → opcionales (`a` → `a?`): en JS todos lo son y el código llama con menos argumentos;
   - `new Set|Map|WeakMap|Promise(…)` sin tipos → con `<any>` (si no, TypeScript deduce `unknown` y protesta en cada uso).
   Uso: node scripts/migrar-ts.mjs <archivo.ts>…  (reescribe los archivos). */
import fs from 'node:fs';
import ts from 'typescript';

for (const f of process.argv.slice(2)) {
  const texto = fs.readFileSync(f, 'utf8');
  const sf = ts.createSourceFile(f, texto, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const cambios = [];
  const visitar = n => {
    if (ts.isParameter(n) && !n.questionToken && !n.initializer && !n.dotDotDotToken && !n.type && ts.isIdentifier(n.name)) {
      const p = n.parent;
      if (ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) || ts.isArrowFunction(p) || ts.isMethodDeclaration(p)) {
        if (ts.isArrowFunction(p) && p.parameters.length === 1 && !texto.slice(p.getStart(sf), p.parameters[0].getStart(sf)).includes('(')) {
          cambios.push([n.getStart(sf), '(']); cambios.push([n.name.getEnd(), '?)']); /* x => … → (x?) => … */
        } else cambios.push([n.name.getEnd(), '?']);
      }
    }
    if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && !n.typeArguments) {
      const k = n.expression.text, ta = { Set: '<any>', Promise: '<any>', Map: '<any, any>', WeakMap: '<any, any>' }[k];
      if (ta) cambios.push([n.expression.getEnd(), ta]);
    }
    ts.forEachChild(n, visitar);
  };
  visitar(sf);
  cambios.sort((a, b) => b[0] - a[0]);
  let out = texto; for (const [pos, ins] of cambios) out = out.slice(0, pos) + ins + out.slice(pos);
  fs.writeFileSync(f, out);
}
