// One-off: cut the old single-file game's script into ES modules under client/src.
// Each top-level statement goes to a module by the section it sits in; imports/exports are worked out
// from the identifiers each module uses and declares. Things now living in shared/ are imported from there.
// Sections that were rewritten by hand (animals, AI, director, init) are written to tools/_old/ for reference.
//   node tools/split-client.mjs ../moose-marsh/game.src.html
import fs from 'fs'; import path from 'path'; import * as acorn from 'acorn';

const SRC = process.argv[2]; const html = fs.readFileSync(SRC, 'utf8'); const lines = html.split(/\r?\n/);
const s0 = lines.findIndex(l => l.trim() === "'use strict';"), s1 = lines.lastIndexOf('</script>', lines.length) >= 0 ? lines.findLastIndex(l => l.startsWith('</script>')) : -1;
const code = lines.slice(0, s1).map((l, i) => (i <= s0 ? '' : l)).join('\n');   // keep line numbers
const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'script', locations: true });

const R = [   // [firstLine, lastLine, target]   target: module path | DROP | OLD:name
  [91, 115, 'DROP'], [116, 116, 'render/core.js'], [117, 171, 'DROP'],
  [172, 196, 'render/core.js'], [197, 297, 'render/textures.js'], [298, 358, 'render/billboards.js'], [359, 385, 'render/sky.js'],
  [386, 415, 'render/terrain.js'], [416, 452, 'render/water.js'], [453, 468, 'render/ridges.js'], [469, 566, 'render/vegetation.js'],
  [567, 604, 'models/moose-geo.js'], [605, 717, 'models/antlers.js'], [718, 900, 'models/moose.js'], [901, 970, 'models/ref-bull.js'],
  [971, 1047, 'OLD:animal'], [1048, 1071, 'render/fx.js'], [1072, 1085, 'OLD:spawn'], [1086, 1330, 'DROP'],
  [1331, 1499, 'audio/audio.js'], [1500, 1577, 'models/critters.js'], [1578, 1642, 'OLD:critter'], [1643, 1663, 'render/birds.js'], [1664, 1673, 'DROP'],
  [1674, 1702, 'OLD:director'], [1703, 1732, 'ui/input.js'], [1733, 1760, 'ui/hud.js'], [1761, 99999, 'OLD:main'],
];
const target = line => (R.find(r => line >= r[0] && line <= r[1]) || [0, 0, 'DROP'])[2];

// names that shared/ provides
const SHARED = {};
for (const [file, rel] of [['shared/util.js', '../../shared/util.js'], ['shared/world.js', '../../shared/world.js'], ['shared/wind.js', '../../shared/wind.js'], ['shared/sim/bullparams.js', '../../shared/sim/bullparams.js'], ['shared/sim/body.js', '../../shared/sim/body.js']]) {
  const m = acorn.parse(fs.readFileSync(file, 'utf8'), { ecmaVersion: 'latest', sourceType: 'module' });
  for (const st of m.body) if (st.type === 'ExportNamedDeclaration' && st.declaration) for (const n of declNames(st.declaration)) if (!SHARED[n]) SHARED[n] = rel;
}
function declNames(st) {
  const out = [];
  const pat = p => { if (!p) return; if (p.type === 'Identifier') out.push(p.name); else if (p.type === 'ObjectPattern') p.properties.forEach(q => pat(q.value || q.argument)); else if (p.type === 'ArrayPattern') p.elements.forEach(pat); else if (p.type === 'AssignmentPattern') pat(p.left); else if (p.type === 'RestElement') pat(p.argument); };
  if (st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration') out.push(st.id.name);
  if (st.type === 'VariableDeclaration') st.declarations.forEach(d => pat(d.id));
  return out;
}
// free identifiers of a top-level statement (function-level scoping: let/const treated like var)
const FN = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
function patNames(p, out) { if (!p) return; if (p.type === 'Identifier') out.add(p.name); else if (p.type === 'ObjectPattern') p.properties.forEach(q => patNames(q.type === 'RestElement' ? q.argument : q.value, out)); else if (p.type === 'ArrayPattern') p.elements.forEach(e => patNames(e, out)); else if (p.type === 'AssignmentPattern') patNames(p.left, out); else if (p.type === 'RestElement') patNames(p.argument, out); }
function children(n, fn) { for (const k of Object.keys(n)) { if (k === 'loc') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(c => c && typeof c.type === 'string' && fn(c, k)); else if (v && typeof v.type === 'string') fn(v, k); } }
function scopeDecls(fnNode) {   // names declared directly in this function (not nested ones)
  const out = new Set(); fnNode.params.forEach(p => patNames(p, out)); if (fnNode.type === 'FunctionExpression' && fnNode.id) out.add(fnNode.id.name);
  const walk = n => {
    if (n.type === 'VariableDeclaration') n.declarations.forEach(d => patNames(d.id, out));
    if ((n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration') && n.id) out.add(n.id.name);
    if (n.type === 'ClassExpression' && n.id) out.add(n.id.name);
    if (n.type === 'CatchClause' && n.param) patNames(n.param, out);
    if (FN.has(n.type)) return;
    children(n, walk);
  };
  if (fnNode.body.type === 'BlockStatement') children(fnNode.body, walk); return out;
}
function refs(node, out = new Set(), assigned = new Set()) {
  const stack = [];
  const bound = name => stack.some(s => s.has(name));
  const visit = (n, parent, key) => {
    if (n.type === 'Identifier') {
      if (parent && ((parent.type === 'MemberExpression' && key === 'property' && !parent.computed) || ((parent.type === 'Property' || parent.type === 'MethodDefinition' || parent.type === 'PropertyDefinition') && key === 'key' && !parent.computed) || ((parent.type === 'LabeledStatement' || parent.type === 'BreakStatement' || parent.type === 'ContinueStatement') && key === 'label'))) return;
      if (!bound(n.name)) out.add(n.name); return;
    }
    if (n.type === 'AssignmentExpression' && n.left.type === 'Identifier' && !bound(n.left.name)) assigned.add(n.left.name);
    if (n.type === 'UpdateExpression' && n.argument.type === 'Identifier' && !bound(n.argument.name)) assigned.add(n.argument.name);
    if (FN.has(n.type)) { stack.push(scopeDecls(n)); children(n, (c, k) => { if (k === 'id' && n.type === 'FunctionDeclaration') return; visit(c, n, k); }); stack.pop(); return; }
    if (n.type === 'CatchClause') { const s = new Set(); patNames(n.param, s); stack.push(s); children(n, (c, k) => visit(c, n, k)); stack.pop(); return; }
    if (n.type === 'VariableDeclarator' && stack.length === 0) { if (n.init) visit(n.init, n, 'init'); return; }   // top-level declared names aren't refs
    if (n.type === 'VariableDeclarator') { if (n.init) visit(n.init, n, 'init'); return; }
    if ((n.type === 'ClassDeclaration' || n.type === 'FunctionDeclaration') && stack.length === 0) { /* fallthrough below */ }
    if (n.type === 'ClassDeclaration' || n.type === 'ClassExpression') { if (n.superClass) visit(n.superClass, n, 'superClass'); visit(n.body, n, 'body'); return; }
    if (n.type === 'ForInStatement' || n.type === 'ForOfStatement') { if (n.left.type !== 'VariableDeclaration') visit(n.left, n, 'left'); visit(n.right, n, 'right'); visit(n.body, n, 'body'); return; }
    children(n, (c, k) => visit(c, n, k));
  };
  // top-level for-of / blocks: give the statement itself a scope for its own let/const
  if (!FN.has(node.type) && node.type !== 'ClassDeclaration' && node.type !== 'VariableDeclaration') { stack.push(scopeDecls({ params: [], body: { type: 'BlockStatement', body: [node] }, type: 'X' })); }
  visit(node); return { out, assigned };
}

const prevEnd = new Map(); ast.body.forEach((st, i) => prevEnd.set(st, i ? ast.body[i - 1].end : st.start));
const mods = {};   // target -> {stmts:[], decl:Set, used:Set, assigned:Set}
for (const st of ast.body) {
  const t = target(st.loc.start.line); if (t === 'DROP') continue;
  const m = mods[t] || (mods[t] = { stmts: [], decl: new Set(), used: new Set(), assigned: new Set() });
  m.stmts.push(st); declNames(st).forEach(n => m.decl.add(n)); const { out, assigned } = refs(st); out.forEach(n => m.used.add(n)); assigned.forEach(n => m.assigned.add(n));
}
const owner = {}; for (const [t, m] of Object.entries(mods)) for (const n of m.decl) { if (owner[n]) console.warn('dup decl', n, owner[n], t); owner[n] = t; }
const GLOBALS = new Set([...Object.getOwnPropertyNames(globalThis), 'window', 'document', 'localStorage', 'indexedDB', 'innerWidth', 'innerHeight', 'location', 'performance', 'requestAnimationFrame', 'AudioContext', 'Image', 'devicePixelRatio', 'navigator', 'addEventListener', 'getComputedStyle', 'HTMLCanvasElement', 'ImageData', 'atob', 'btoa', 'undefined', 'arguments', 'this', 'Uint8Array', 'console', 'setTimeout', 'clearTimeout', 'fetch', 'Blob', 'URL', 'THREE']);

const STATE = new Set(['PLAYER', 'PPT', 'G', 'ANIMALS', 'bearingOf', 'Q', 'TEST']);   // client/src/state.js (written by hand)
const unresolved = {}, crossAssign = [];
fs.mkdirSync('tools/_old', { recursive: true });
for (const [t, m] of Object.entries(mods)) {
  const text = m.stmts.map(st => code.slice(prevEnd.get(st), st.end).replace(/^\s*\n/, ''));   // with the comments just above it
  if (t.startsWith('OLD:')) { fs.writeFileSync(`tools/_old/${t.slice(4)}.js`, text.join('\n')); continue; }
  const imports = {}; const add = (from, n) => (imports[from] || (imports[from] = new Set())).add(n);
  const file = path.join('client/src', t);
  for (const n of m.used) {
    if (m.decl.has(n)) continue;
    if (owner[n] && !owner[n].startsWith('OLD:')) { let rel = path.relative(path.dirname(file), path.join('client/src', owner[n])).replace(/\\/g, '/'); if (!rel.startsWith('.')) rel = './' + rel; add(rel, n); }
    else if (SHARED[n]) add(SHARED[n], n);
    else if (STATE.has(n)) { let rel = path.relative(path.dirname(file), 'client/src/state.js').split(path.sep).join('/'); if (!rel.startsWith('.')) rel = './' + rel; add(rel, n); }
    else if (!GLOBALS.has(n)) (unresolved[t] || (unresolved[t] = new Set())).add(n);
    if (m.assigned.has(n) && !m.decl.has(n)) crossAssign.push(`${t}: assigns ${n} (declared in ${owner[n] || SHARED[n] || '?'})`);
  }
  let head = `// ${t} — split out of the original single-file game (game.src.html)\n`;
  if (m.used.has('THREE')) head += `import * as THREE from 'three';\n`;
  for (const [from, ns] of Object.entries(imports).sort()) head += `import { ${[...ns].sort().join(', ')} } from '${from}';\n`;
  const body = text.join('\n');
  const exp = [...m.decl].sort();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, head + '\n' + body + '\n\nexport { ' + exp.join(', ') + ' };\n');
  console.log('wrote', file, m.stmts.length, 'statements,', exp.length, 'exports');
}
console.log('\nUNRESOLVED (need a home):'); for (const [t, s] of Object.entries(unresolved)) console.log(' ', t, [...s].join(' '));
console.log('\nASSIGNS ACROSS MODULES:'); crossAssign.forEach(x => console.log(' ', x));
