const segmenter = typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null;

export function segmentPosterText(text) {
  return segmenter ? Array.from(segmenter.segment(text), ({ segment }) => segment) : Array.from(text);
}

const lastColumn = (cell) => cell.columnEnd ?? cell.column;
const minimumOverlap = 1e-8;

function readingRows(cells) {
  const columns = new Map();
  for (const cell of cells) {
    if (!columns.has(cell.column)) columns.set(cell.column, []);
    columns.get(cell.column).push(cell);
  }
  for (const column of columns.values()) column.sort((first, second) => first.row - second.row);

  const rows = [];
  while (columns.size) {
    const heads = [...columns.values()].map(([cell]) => cell);
    const anchor = heads.reduce((first, cell) => (
      cell.y < first.y || (cell.y === first.y && cell.column < first.column) ? cell : first
    ));
    let top = anchor.y;
    let bottom = anchor.y + anchor.height;
    let shortest = anchor.height;
    const row = [anchor];

    // Neighboring columns can share a reading row when their blocks overlap vertically.
    for (const direction of [-1, 1]) {
      let edge = anchor;
      while (true) {
        const candidate = heads.find((cell) => {
          const touches = direction === 1 ? lastColumn(edge) + 1 === cell.column : lastColumn(cell) + 1 === edge.column;
          const overlap = Math.min(bottom, cell.y + cell.height) - Math.max(top, cell.y);
          return touches && overlap >= Math.min(shortest, cell.height) * .2;
        });
        if (!candidate) break;
        row.push(candidate);
        top = Math.max(top, candidate.y);
        bottom = Math.min(bottom, candidate.y + candidate.height);
        shortest = Math.min(shortest, candidate.height);
        edge = candidate;
      }
    }
    row.sort((first, second) => first.column - second.column);
    rows.push(row);
    for (const { column } of row) {
      const queue = columns.get(column);
      queue.shift();
      if (!queue.length) columns.delete(column);
    }
  }
  return rows;
}

export function posterReadingOrder(cells) {
  return readingRows(cells).flat();
}

function neighboring(first, second) {
  return first && first.row === second.row && lastColumn(first.cell) + 1 === second.cell.column;
}

function seededOffset(seed, word, choices) {
  // Mix the word index with the seed so a space keeps its offset as more type is added.
  let value = seed ^ Math.imul(word + 1, 0x9e3779b9);
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return (value >>> 0) % choices;
}

function collectWordRuns(cells, lengths) {
  const runs = new Map(lengths.map((length) => [length, new Map()]));
  // A horizontal band can use every cell it crosses, even when their top edges are staggered.
  const boundaries = [...new Set(cells.flatMap(({ y, height }) => [y, y + height]))].sort((a, b) => a - b);
  const ordered = [...cells].sort((a, b) => a.column - b.column);
  for (let band = 1; band < boundaries.length; band++) {
    if (boundaries[band] - boundaries[band - 1] < minimumOverlap) continue;
    const middle = (boundaries[band - 1] + boundaries[band]) / 2;
    const across = ordered.filter(({ y, height }) => y <= middle && y + height > middle);
    for (const [length, matches] of runs) {
      for (let start = 0; start <= across.length - length; start++) {
        const word = across.slice(start, start + length);
        if (!word.every((cell, index) => !index || lastColumn(word[index - 1]) + 1 === cell.column)) continue;
        const key = word.map(({ id }) => id).join(' ');
        if (matches.has(key)) continue;
        const centers = word.map(({ y, height }) => y + height / 2);
        const heights = word.map(({ height }) => height).sort((a, b) => a - b);
        matches.set(key, {
          cells: word,
          top: Math.max(...word.map(({ y }) => y)),
          bottom: Math.min(...word.map(({ y, height }) => y + height)),
          left: word[0].column,
          right: lastColumn(word.at(-1)),
          alignment: (Math.max(...centers) - Math.min(...centers)) / heights[Math.floor(length / 2)],
        });
      }
    }
  }
  return new Map([...runs].map(([length, matches]) => [length, [...matches.values()].sort((a, b) => a.top - b.top || a.left - b.left)]));
}

function followsWord(run, previous) {
  if (!previous) return true;
  if (run.top >= previous.bottom - minimumOverlap) return true;
  const overlap = Math.min(run.bottom, previous.bottom) - Math.max(run.top, previous.top);
  return overlap > minimumOverlap && run.left > previous.right;
}

function rankWordRun(run, previous) {
  const flowsIntoPrevious = previous && run.top < previous.bottom - minimumOverlap && run.left === previous.right + 1;
  const centersMisaligned = run.alignment > .8;
  return (centersMisaligned ? 2 : 0) + (flowsIntoPrevious ? 1 : 0);
}

function placeAdjacentWords(cells, words, seed) {
  if (!words.length) return new Map();
  const runs = collectWordRuns(cells, [...new Set(words.map((word) => word.length))]);
  if ([...runs.values()].some((choices) => !choices.length)) return null;
  const placement = new Map();
  const trialLimit = 1500;
  let trials = 0;

  function placeNext(index, previous) {
    if (index === words.length) return true;
    if (trials++ >= trialLimit) return false;
    const word = words[index];
    const choices = runs.get(word.length).filter((run) => (
      followsWord(run, previous) && run.cells.every(({ id }) => !placement.has(id))
    ));
    if (!choices.length) return false;
    choices.sort((a, b) => rankWordRun(a, previous) - rankWordRun(b, previous));
    const bestRank = rankWordRun(choices[0], previous);
    const nextRank = choices.findIndex((run) => rankWordRun(run, previous) > bestRank);
    const preferredCount = nextRank < 0 ? choices.length : nextRank;
    const offset = index || seed ? seededOffset(seed, index, Math.min(preferredCount, 8)) : 0;
    const candidates = [...choices.slice(offset, preferredCount), ...choices.slice(0, offset), ...choices.slice(preferredCount)];
    for (const run of candidates) {
      if (trials >= trialLimit) break;
      run.cells.forEach(({ id }, letter) => placement.set(id, { text: word[letter], slot: placement.size }));
      if (placeNext(index + 1, run)) return true;
      run.cells.forEach(({ id }) => placement.delete(id));
    }
    return false;
  }

  return placeNext(0, null) ? placement : null;
}

export function flowPosterText(cells, text, seed = 0) {
  const available = cells.filter((cell) => cell.block !== 'color');
  const words = [];
  let slack = available.length;
  for (const word of text.normalize().split(/\s+/u).filter(Boolean)) {
    if (!slack) break;
    const letters = segmentPosterText(word).slice(0, slack);
    words.push(letters);
    slack -= letters.length;
  }

  const adjacent = placeAdjacentWords(available, words, seed);
  if (adjacent) return adjacent;

  // When there is no room for whole rows of words, keep the copy in order through line breaks.
  const positions = readingRows(cells).flatMap((row, index) => row
    .filter((cell) => cell.block !== 'color')
    .map((cell) => ({ cell, row: index })));
  const choices = wordStarts(positions, words, slack, seed);
  let cursor = 0;
  const placement = new Map();
  for (const [wordIndex, word] of words.entries()) {
    cursor = choices[wordIndex][cursor - placement.size];
    for (const text of word) {
      placement.set(positions[cursor++].cell.id, { text, slot: placement.size });
    }
  }
  return placement;
}

function wordStarts(positions, words, slack, seed) {
  const connected = positions.map((position, index) => neighboring(positions[index - 1], position));
  let breaks = 0;
  const cuts = connected.map((present) => present ? breaks : ++breaks);
  const choices = new Array(words.length);
  let nextCost = new Array(slack + 1).fill(0);
  let earliest = positions.length - slack;

  // First minimize the gaps within words, then separate each word from the next.
  // When both are equally readable, use the seeded offsets to vary the placement.
  const priority = (positions.length + 9) * words.length + 1;
  for (let wordIndex = words.length - 1; wordIndex >= 0; wordIndex--) {
    const length = words[wordIndex].length;
    earliest -= length;
    const requested = wordIndex ? 1 + seededOffset(seed, wordIndex, Math.min(8, slack + 1))
      : seed ? seededOffset(seed, wordIndex, Math.min(9, slack + 1)) : 0;
    const cost = new Array(slack + 1);
    const starts = new Array(slack + 1);
    for (let skipped = 0; skipped <= slack; skipped++) {
      const cursor = earliest + skipped;
      const offset = Math.min(requested, slack - skipped);
      let best = cursor;
      let bestCost = Infinity;
      let bestDistance = Infinity;
      for (let start = cursor; start <= earliest + slack; start++) {
        const wordBreaks = cuts[start + length - 1] - cuts[start];
        const runsTogether = wordIndex > 0 && start === cursor && connected[start];
        const distance = Math.abs(start - cursor - offset);
        const total = wordBreaks * priority ** 2 + (runsTogether ? priority : 0) + distance + nextCost[start - earliest];
        if (total > bestCost || (total === bestCost && distance > bestDistance)) continue;
        if (total === bestCost && distance === bestDistance && positions[start].cell.block !== 'text') continue;
        best = start;
        bestCost = total;
        bestDistance = distance;
      }
      cost[skipped] = bestCost;
      starts[skipped] = best;
    }
    choices[wordIndex] = starts;
    nextCost = cost;
  }
  return choices;
}
