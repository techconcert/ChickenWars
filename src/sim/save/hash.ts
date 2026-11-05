// FNV-1a 32-bit over canonical JSON (sorted keys). Streamed so large states do not build a giant string.
const PRIME = 0x01000193;

function walk(v: unknown, feed: (s: string) => void): void {
  if (v === null) { feed('null'); return; }
  switch (typeof v) {
    case 'number': feed(Number.isFinite(v) ? String(v) : 'null'); return;
    case 'boolean': feed(v ? 'true' : 'false'); return;
    case 'string': feed(JSON.stringify(v)); return;
    case 'object': {
      if (Array.isArray(v)) {
        feed('[');
        for (let i = 0; i < v.length; i++) {
          if (i) feed(',');
          const x = v[i];
          if (x === undefined || typeof x === 'function') feed('null'); else walk(x, feed);
        }
        feed(']');
        return;
      }
      const o = v as Record<string, unknown>;
      feed('{');
      let first = true;
      for (const k of Object.keys(o).sort()) {
        const x = o[k];
        if (x === undefined || typeof x === 'function') continue;
        if (!first) feed(',');
        first = false;
        feed(JSON.stringify(k));
        feed(':');
        walk(x, feed);
      }
      feed('}');
      return;
    }
    default: feed('null');
  }
}

export function canonicalJson(v: unknown): string {
  let out = '';
  walk(v, (s) => { out += s; });
  return out;
}

/** FNV-1a 32 of canonicalJson(v), as an unsigned integer. */
export function hashState(v: unknown): number {
  let h = 0x811c9dc5;
  walk(v, (s) => {
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, PRIME); }
  });
  return h >>> 0;
}

export const hashHex = (v: unknown): string => hashState(v).toString(16).padStart(8, '0');
