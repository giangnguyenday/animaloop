export async function loadPalette() {
  const response = await fetch('./palette.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error('Could not load palette.json.');
  const data = await response.json();
  const entries = Array.isArray(data) ? data : data.colors;
  if (!Array.isArray(entries)) throw new Error('palette.json needs an array of colors.');
  return entries.map((entry) => typeof entry === 'string' ? { name: entry, hex: entry } : entry)
    .filter((entry) => typeof entry?.hex === 'string' && /^#[\da-f]{6}$/i.test(entry.hex))
    .map(({ name, hex, group }) => ({ name: name || hex, hex, group: typeof group === 'string' ? group : '' }));
}
