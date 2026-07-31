/**
 * roundtrip.js — the roundtrip diff (P2/C.2)
 *
 * Compares an original feed against the feed generated from the document lifted
 * out of it. Pure: no fs, no clock, no randomness. The same input produces the
 * same report, byte for byte.
 *
 * **Every semantic decision in this file is fixed in `docs/roundtrip.md`, which
 * was written before this file existed.** That document is the specification;
 * this is its implementation. Where the two disagree, the disagreement is a
 * finding, and the document is not to be edited to match the code.
 *
 * The tables below are the document's decisions in executable form:
 *
 *   ROW_KEYS        — decision 2, the identifying columns per file
 *   SEQUENCE_FILES  — decision 2's stated exception, compared in order
 *   SINGLE_ROW      — files the specification defines as carrying one row
 *   NUMERIC_FIELDS  — decision 5, the fields that are quantities
 *
 * A file with no entry in any of them is **refused**, not guessed at: choosing a
 * key while comparing is choosing a normalisation with the result in view.
 *
 * What this file deliberately does not do: pair rows whose key values differ
 * between the two sides. The export regenerates some identifiers, so those rows
 * share no key and are reported as present on one side only. Pairing them needs
 * a mapping that no data supports — see `docs/roundtrip.md`, "What is
 * deliberately not normalised".
 */

import { parseCsvText } from './read.js';

/* ------------------------------------------------------- decision 2: keys */

/** Identifying columns per file. Decision 2 of docs/roundtrip.md. */
export const ROW_KEYS = Object.freeze({
  'agency.txt': ['agency_id'],
  'routes.txt': ['route_id'],
  'trips.txt': ['trip_id'],
  'calendar.txt': ['service_id'],
  'calendar_dates.txt': ['service_id', 'date'],
  'stops.txt': ['stop_id'],
  'location_groups.txt': ['location_group_id'],
  'location_group_stops.txt': ['location_group_id', 'stop_id'],
  'booking_rules.txt': ['booking_rule_id'],
  'translations.txt': [
    'table_name', 'field_name', 'language', 'record_id', 'record_sub_id', 'field_value',
  ],
});

/**
 * The stated exception: order is semantic here, so rows are grouped and then
 * compared position by position in `stop_sequence` order. A set comparison
 * would call a reversed trip a match.
 */
export const SEQUENCE_FILES = Object.freeze({
  'stop_times.txt': Object.freeze({ group: 'trip_id', order: 'stop_sequence' }),
});

/** Files the specification defines as carrying exactly one row. */
export const SINGLE_ROW = Object.freeze(new Set(['feed_info.txt']));

/* --------------------------------------------------- decision 5: numerics */

/**
 * Fields that are quantities and are therefore compared numerically. Everything
 * else — every identifier, name, URL, colour, language code, date and time — is
 * compared textually. Fixed here so the split cannot be adjusted to suit a
 * result.
 */
export const NUMERIC_FIELDS = Object.freeze(new Set([
  'stop_lat', 'stop_lon', 'stop_sequence',
  'route_type', 'location_type', 'pickup_type', 'drop_off_type',
  'timepoint', 'direction_id', 'exception_type',
  'booking_type', 'prior_notice_duration_min', 'prior_notice_start_day',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
]));

/** Separator for composite keys — a unit separator cannot occur in a CSV field. */
const KEY_SEP = String.fromCharCode(31);

/* ---------------------------------------------------------------- helpers */

/**
 * Decision 5. Textual everywhere except the listed numeric fields; empty is
 * never coerced into a number, because empty is not a quantity.
 */
export function valuesEqual(column, a, b) {
  if (a === b) return true;
  if (!NUMERIC_FIELDS.has(column)) return false;
  if (a === '' || b === '') return false;
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
  return na === nb;
}

const keyOf = (columns, row) => columns.map((c) => row[c] ?? '').join(KEY_SEP);

/** Original header order first, then columns only the generated side carries. */
function unionColumns(originalHeader, generatedHeader) {
  const out = [...originalHeader];
  for (const c of generatedHeader) if (!out.includes(c)) out.push(c);
  return out;
}

/**
 * Compare one paired row across the union of both headers.
 *
 * Decision 4: a column absent from a header is not an empty value. The three
 * states — present and non-empty, present and empty, absent — stay apart, and
 * the difference records which of them each side was in.
 */
function compareRow(file, key, originalRow, generatedRow, originalHeader, generatedHeader) {
  const differences = [];

  for (const column of unionColumns(originalHeader, generatedHeader)) {
    const inOriginal = originalHeader.includes(column);
    const inGenerated = generatedHeader.includes(column);

    if (inOriginal && !inGenerated) {
      differences.push({
        file, key, column, kind: 'column_absent_in_generated',
        original: originalRow[column], generated: null,
      });
      continue;
    }
    if (!inOriginal && inGenerated) {
      differences.push({
        file, key, column, kind: 'column_absent_in_original',
        original: null, generated: generatedRow[column],
      });
      continue;
    }
    if (!valuesEqual(column, originalRow[column], generatedRow[column])) {
      differences.push({
        file, key, column, kind: 'value_differs',
        original: originalRow[column], generated: generatedRow[column],
      });
    }
  }

  return differences;
}

/** Rows in `stop_sequence` order within one trip. Ties keep their input order. */
function inSequenceOrder(rows, orderColumn) {
  return [...rows].map((row, i) => ({ row, i })).sort((a, b) => {
    const na = Number(a.row[orderColumn]);
    const nb = Number(b.row[orderColumn]);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return a.i - b.i;
  }).map(({ row }) => row);
}

function groupBy(rows, column) {
  const groups = new Map();
  for (const row of rows) {
    const g = row[column] ?? '';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(row);
  }
  return groups;
}

/* ------------------------------------------------------------ per-file diff */

function diffKeyed(file, keyColumns, original, generated) {
  const result = emptyFileResult('keyed');
  result.columns = columnAsymmetry(original.header, generated.header);

  const generatedByKey = new Map(generated.rows.map((r) => [keyOf(keyColumns, r), r]));
  const seen = new Set();

  for (const originalRow of original.rows) {
    const key = keyOf(keyColumns, originalRow);
    const generatedRow = generatedByKey.get(key);
    if (generatedRow === undefined) {
      result.rows.onlyOriginal.push({ key, row: originalRow });
      continue;
    }
    seen.add(key);
    result.rows.matched += 1;
    result.differences.push(
      ...compareRow(file, key, originalRow, generatedRow, original.header, generated.header),
    );
  }

  for (const generatedRow of generated.rows) {
    const key = keyOf(keyColumns, generatedRow);
    if (!seen.has(key)) result.rows.onlyGenerated.push({ key, row: generatedRow });
  }

  return result;
}

function diffSequence(file, spec, original, generated) {
  const result = emptyFileResult('sequence');
  result.columns = columnAsymmetry(original.header, generated.header);

  const originalGroups = groupBy(original.rows, spec.group);
  const generatedGroups = groupBy(generated.rows, spec.group);

  for (const [group, rows] of originalGroups) {
    const other = generatedGroups.get(group);
    const ordered = inSequenceOrder(rows, spec.order);

    if (other === undefined) {
      ordered.forEach((row, i) => result.rows.onlyOriginal.push({ key: `${group}#${i + 1}`, row }));
      continue;
    }

    const otherOrdered = inSequenceOrder(other, spec.order);
    const shared = Math.min(ordered.length, otherOrdered.length);

    for (let i = 0; i < shared; i += 1) {
      result.rows.matched += 1;
      result.differences.push(
        ...compareRow(file, `${group}#${i + 1}`, ordered[i], otherOrdered[i],
          original.header, generated.header),
      );
    }
    for (let i = shared; i < ordered.length; i += 1) {
      result.rows.onlyOriginal.push({ key: `${group}#${i + 1}`, row: ordered[i] });
    }
    for (let i = shared; i < otherOrdered.length; i += 1) {
      result.rows.onlyGenerated.push({ key: `${group}#${i + 1}`, row: otherOrdered[i] });
    }
  }

  for (const [group, rows] of generatedGroups) {
    if (originalGroups.has(group)) continue;
    inSequenceOrder(rows, spec.order).forEach((row, i) => {
      result.rows.onlyGenerated.push({ key: `${group}#${i + 1}`, row });
    });
  }

  return result;
}

function diffSingleRow(file, original, generated) {
  const result = emptyFileResult('single-row');
  result.columns = columnAsymmetry(original.header, generated.header);

  const shared = Math.min(original.rows.length, generated.rows.length);
  for (let i = 0; i < shared; i += 1) {
    result.rows.matched += 1;
    result.differences.push(
      ...compareRow(file, `#${i + 1}`, original.rows[i], generated.rows[i],
        original.header, generated.header),
    );
  }
  for (let i = shared; i < original.rows.length; i += 1) {
    result.rows.onlyOriginal.push({ key: `#${i + 1}`, row: original.rows[i] });
  }
  for (let i = shared; i < generated.rows.length; i += 1) {
    result.rows.onlyGenerated.push({ key: `#${i + 1}`, row: generated.rows[i] });
  }

  return result;
}

function columnAsymmetry(originalHeader, generatedHeader) {
  return {
    onlyOriginal: originalHeader.filter((c) => !generatedHeader.includes(c)),
    onlyGenerated: generatedHeader.filter((c) => !originalHeader.includes(c)),
  };
}

function emptyFileResult(comparedAs) {
  return {
    comparedAs,
    columns: { onlyOriginal: [], onlyGenerated: [] },
    rows: { matched: 0, onlyOriginal: [], onlyGenerated: [] },
    differences: [],
  };
}

/* -------------------------------------------------------------------- main */

/**
 * Diff an original feed against a generated one.
 *
 * @param {Record<string,string>} original   file name → text
 * @param {Record<string,string>} generated  file name → text
 * @returns {object} the structured report; see docs/roundtrip.md
 * @throws {Error} on a file for which no comparison semantics are declared
 */
export function diffFeeds(original, generated) {
  const names = [...new Set([...Object.keys(original), ...Object.keys(generated)])].sort();

  const report = {
    files: { matched: [], onlyOriginal: [], onlyGenerated: [] },
    perFile: {},
    totals: {
      filesOnlyOriginal: 0,
      filesOnlyGenerated: 0,
      rowsMatched: 0,
      rowsOnlyOriginal: 0,
      rowsOnlyGenerated: 0,
      fieldDifferences: 0,
    },
  };

  for (const file of names) {
    const inOriginal = Object.hasOwn(original, file);
    const inGenerated = Object.hasOwn(generated, file);

    // Decision 6: a file on one side only is a difference, never a skip, and is
    // never treated as an empty file on the missing side.
    if (inOriginal && !inGenerated) {
      report.files.onlyOriginal.push({ file, rows: countRows(file, original[file]) });
      report.totals.filesOnlyOriginal += 1;
      continue;
    }
    if (!inOriginal && inGenerated) {
      report.files.onlyGenerated.push({ file, rows: countRows(file, generated[file]) });
      report.totals.filesOnlyGenerated += 1;
      continue;
    }

    report.files.matched.push(file);

    if (!file.endsWith('.txt')) {
      // Not a CSV. Nothing in docs/roundtrip.md declares field semantics for a
      // non-CSV payload, so it is compared as text and reported as one unit.
      const differs = original[file] !== generated[file];
      report.perFile[file] = {
        comparedAs: 'raw',
        columns: { onlyOriginal: [], onlyGenerated: [] },
        rows: { matched: differs ? 0 : 1, onlyOriginal: [], onlyGenerated: [] },
        differences: differs
          ? [{ file, key: '#1', column: '(whole file)', kind: 'value_differs',
            original: original[file], generated: generated[file] }]
          : [],
      };
      continue;
    }

    const originalParsed = parseCsvText(original[file]);
    const generatedParsed = parseCsvText(generated[file]);

    let result;
    if (SEQUENCE_FILES[file]) {
      result = diffSequence(file, SEQUENCE_FILES[file], originalParsed, generatedParsed);
    } else if (SINGLE_ROW.has(file)) {
      result = diffSingleRow(file, originalParsed, generatedParsed);
    } else if (ROW_KEYS[file]) {
      result = diffKeyed(file, ROW_KEYS[file], originalParsed, generatedParsed);
    } else {
      throw new Error(
        `no comparison semantics declared for ${file} — docs/roundtrip.md must declare its ` +
        'identifying columns before it can be compared; choosing a key here would be choosing ' +
        'a normalisation with the result already in view',
      );
    }

    report.perFile[file] = result;
    report.totals.rowsMatched += result.rows.matched;
    report.totals.rowsOnlyOriginal += result.rows.onlyOriginal.length;
    report.totals.rowsOnlyGenerated += result.rows.onlyGenerated.length;
    report.totals.fieldDifferences += result.differences.length;
  }

  return report;
}

/** Data rows in a CSV text, or null for a payload that is not CSV. */
function countRows(file, text) {
  if (!file.endsWith('.txt')) return null;
  return parseCsvText(text).rows.length;
}
