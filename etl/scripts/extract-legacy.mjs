// Reads the data constants still embedded in index.html. Used by the seed
// generator; also the migration path for retiring those constants.
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');

/** Slice a balanced {...} or [...] literal starting at the first open bracket after `from`. */
function balanced(src, from, open, close) {
  const start = src.indexOf(open, from);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    // Skip template literals — circuit paths are backtick strings.
    if (ch === '`') { i = src.indexOf('`', i + 1); continue; }
    if (ch === open) depth++;
    else if (ch === close && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unbalanced ${open} from index ${from}`);
}

export async function extractLegacyData(htmlPath = path.join(ROOT, 'index.html')) {
  const html = await readFile(htmlPath, 'utf8');
  const js = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
  const ctx = vm.createContext({});

  for (const name of ['CIRCUIT_PATHS', 'DRIVERS', 'FLAGS', 'HISTORY', 'STATIC_PODIUMS']) {
    const at = js.indexOf(`const ${name}`);
    if (at === -1) continue;
    vm.runInContext(`var ${name} = ${balanced(js, at, '{', '}')}`, ctx);
  }
  const racesAt = js.indexOf('const races=[');
  vm.runInContext(`var races = ${balanced(js, racesAt, '[', ']')}`, ctx);

  return {
    circuitPaths: ctx.CIRCUIT_PATHS ?? {},
    drivers: ctx.DRIVERS ?? {},
    flags: ctx.FLAGS ?? {},
    history: ctx.HISTORY ?? {},
    staticPodiums: ctx.STATIC_PODIUMS ?? {},
    races: ctx.races ?? [],
  };
}

if (import.meta.filename === process.argv[1]) {
  const d = await extractLegacyData();
  console.log(Object.fromEntries(
    Object.entries(d).map(([k, v]) => [k, Array.isArray(v) ? v.length : Object.keys(v).length])));
}
