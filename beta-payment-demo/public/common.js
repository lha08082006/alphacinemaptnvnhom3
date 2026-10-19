async function api(url, opts) {
  const r = await fetch(url, opts && opts.body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(opts.body) } : opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Lỗi ' + r.status);
  return data;
}
const money = (n) => Number(n).toLocaleString('vi-VN') + 'đ';
const hhmmss = (iso) => new Date(iso).toLocaleTimeString('vi-VN', { hour12: false });
const mmss = (ms) => { ms = Math.max(0, ms); const s = Math.ceil(ms / 1000); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const codeFromPath = () => location.pathname.split('/').pop();

// QR giả (không quét được): ô vuông sinh theo nội dung + 3 ô định vị
function fakeQR(text, size = 220) {
  const n = 25, cell = size / n;
  let h = 2166136261;
  for (const c of text) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const rnd = () => { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return h; };
  let r = '';
  const inFinder = (x, y) => (x < 8 && y < 8) || (x >= n - 8 && y < 8) || (x < 8 && y >= n - 8);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++)
    if (!inFinder(x, y) && rnd() % 2) r += `<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}"/>`;
  const finder = (x, y) => `<rect x="${x * cell}" y="${y * cell}" width="${7 * cell}" height="${7 * cell}"/><rect x="${(x + 1) * cell}" y="${(y + 1) * cell}" width="${5 * cell}" height="${5 * cell}" fill="#fff"/><rect x="${(x + 2) * cell}" y="${(y + 2) * cell}" width="${3 * cell}" height="${3 * cell}"/>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="#111">${r}${finder(0, 0)}${finder(n - 7, 0)}${finder(0, n - 7)}</svg>`;
}
