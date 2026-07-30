/**
 * read.js — GTFS-Flex feed reader (P1.1)
 *
 * Pure: no fs, no path, no process, no os, no url, no child_process. The core
 * receives bytes or strings and never a filename on disk; the CLI does the
 * reading. Everything here is browser-portable.
 *
 * Fidelity rules (CLAUDE.md 4a, blueprint C.0/9): values are carried through
 * exactly as the bytes give them. A UTF-8 BOM is stripped because it is a
 * transport artefact of the file, not a character of the first field. Nothing
 * else is touched — no .normalize(), no whitespace collapsing, no case folding,
 * no trimming (not even on the outer edges: the reader's job is fidelity, and
 * trimming is a no-op on the bundled fixture by assertion F3). Empty strings
 * stay empty strings, because an empty booking_url is a fact about the feed.
 */

import JSZip from 'jszip';
import Papa from 'papaparse';

const BOM = '﻿';

/**
 * Files GTFS requires. Their absence is a diagnostic, never an exception — the
 * fence decides what is fatal, not the reader.
 */
const REQUIRED_FILES = ['agency.txt', 'routes.txt', 'stops.txt', 'stop_times.txt', 'trips.txt'];

/** At least one of these must be present in a valid GTFS feed. */
const CALENDAR_FILES = ['calendar.txt', 'calendar_dates.txt'];

/** Entries parsed as CSV. Anything else is kept as text and never parsed. */
const isCsvName = (name) => name.endsWith('.txt');

/** Strip a leading UTF-8 BOM. Never touches anything else. */
export function stripBom(text) {
  return text.startsWith(BOM) ? text.slice(BOM.length) : text;
}

/** Decode bytes as UTF-8. Invalid input is reported, never thrown. */
function decodeUtf8(bytes, name, diagnostics) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    diagnostics.push({
      code: 'invalid_utf8',
      file: name,
      message: `${name} is not valid UTF-8; decoded with replacement characters.`,
    });
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/**
 * Parse one CSV file. Header row becomes the object keys, verbatim. Values are
 * returned as strings, always — no type coercion, no empty-to-null conversion.
 */
function parseCsv(text, name, diagnostics) {
  const result = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    transform: undefined,
    transformHeader: undefined,
  });

  for (const err of result.errors ?? []) {
    diagnostics.push({
      code: 'csv_parse',
      file: name,
      message: `${name}: ${err.message}`,
      evidence: { row: err.row, type: err.type, code: err.code },
    });
  }

  const header = result.meta?.fields ?? [];
  // PapaParse omits keys for short rows; fill them with '' so every row has the
  // same shape. A missing field and an empty field are both "the feed says
  // nothing here", and both are '' — never undefined, never null.
  const rows = (result.data ?? []).map((row) => {
    const filled = {};
    for (const key of header) filled[key] = row[key] ?? '';
    return filled;
  });

  return { header, rows };
}

/** Normalise a zip entry name to its last path segment (no path module here). */
function baseName(entryName) {
  const parts = entryName.split('/');
  return parts[parts.length - 1];
}

/** True for the shapes JSZip can load: bytes, not text. */
function looksLikeBytes(value) {
  return value instanceof Uint8Array || value instanceof ArrayBuffer;
}

/**
 * Read a feed.
 *
 * @param {Uint8Array|ArrayBuffer|Object} input  a zip archive as bytes, or a
 *        plain map of { filename -> string | bytes }.
 * @returns {Promise<{
 *   files: Record<string, Array<Record<string,string>>>,
 *   headers: Record<string, string[]>,
 *   raw: Record<string, string>,
 *   present: string[],
 *   diagnostics: Array<{code: string, file?: string, message: string, evidence?: any}>
 * }>}
 */
export async function readFeed(input) {
  const diagnostics = [];
  const texts = await collectTexts(input, diagnostics);

  const files = {};
  const headers = {};
  const raw = {};

  for (const name of Object.keys(texts).sort()) {
    const text = texts[name];
    if (isCsvName(name)) {
      const { header, rows } = parseCsv(text, name, diagnostics);
      files[name] = rows;
      headers[name] = header;
    } else {
      // locations.geojson and anything else: kept verbatim, never parsed here.
      raw[name] = text;
    }
  }

  const present = Object.keys(texts).sort();

  for (const required of REQUIRED_FILES) {
    if (!present.includes(required)) {
      diagnostics.push({
        code: 'missing_required_file',
        file: required,
        message: `${required} is absent; GTFS requires it.`,
      });
    }
  }
  if (!CALENDAR_FILES.some((f) => present.includes(f))) {
    diagnostics.push({
      code: 'missing_required_file',
      file: CALENDAR_FILES.join(' | '),
      message: 'Neither calendar.txt nor calendar_dates.txt is present; GTFS requires at least one.',
    });
  }

  return { files, headers, raw, present, diagnostics };
}

/** Turn either input shape into { filename -> decoded text }. */
async function collectTexts(input, diagnostics) {
  if (input == null) {
    diagnostics.push({ code: 'no_input', message: 'No input given.' });
    return {};
  }

  if (looksLikeBytes(input)) return readZip(input, diagnostics);

  if (typeof input === 'object') {
    const texts = {};
    for (const [name, content] of Object.entries(input)) {
      const key = baseName(name);
      const text = typeof content === 'string'
        ? content
        : decodeUtf8(toBytes(content), key, diagnostics);
      texts[key] = stripBom(text);
    }
    return texts;
  }

  diagnostics.push({
    code: 'unsupported_input',
    message: 'Input must be zip bytes or a map of { filename -> content }.',
  });
  return {};
}

function toBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array(0);
}

async function readZip(bytes, diagnostics) {
  const texts = {};
  let zip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch (e) {
    diagnostics.push({
      code: 'unreadable_archive',
      message: `The input is not a readable zip archive: ${e.message}`,
    });
    return texts;
  }

  const entries = [];
  zip.forEach((entryPath, entry) => {
    if (!entry.dir) entries.push([entryPath, entry]);
  });
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  for (const [entryPath, entry] of entries) {
    const name = baseName(entryPath);
    if (!name) continue;
    if (Object.prototype.hasOwnProperty.call(texts, name)) {
      diagnostics.push({
        code: 'duplicate_entry_name',
        file: name,
        message: `The archive carries more than one entry named ${name}; the first was kept.`,
        evidence: { entry_path: entryPath },
      });
      continue;
    }
    const content = await entry.async('uint8array');
    texts[name] = stripBom(decodeUtf8(content, name, diagnostics));
  }

  return texts;
}
