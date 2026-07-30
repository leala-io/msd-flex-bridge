/**
 * purity.test.js — the purity checker is itself tested (blueprint C.3/4).
 *
 * A gate that cannot be shown to reject a real violation, and to accept an
 * identifier that merely looks like one, is not a gate.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { analyse } from '../scripts/check-purity.mjs';

/* ------------------------------------------------------ real violations */

test('rejects host imports in every form', () => {
  const cases = [
    "import { readFileSync } from 'fs';",
    "import { readFileSync } from 'node:fs';",
    "import { readFile } from 'node:fs/promises';",
    "import { join } from 'path';",
    "import { execFileSync } from 'node:child_process';",
    "import os from 'os';",
    "import { fileURLToPath } from 'node:url';",
    "import process from 'node:process';",
    "const fs = require('fs');",
    "const { join } = require('node:path');",
    "const mod = await import('node:os');",
    "export { readFileSync } from 'node:fs';",
  ];
  for (const source of cases) {
    const findings = analyse(source, 'sample.js');
    assert.equal(findings.length, 1, source);
    assert.equal(findings[0].kind, 'host import', source);
  }
});

test('rejects wall clock and randomness', () => {
  const cases = [
    ['const t = Date.now();', 'Date.now()'],
    ['const d = new Date();', 'new Date() without argument'],
    ['const d = new  Date( );', 'new Date() without argument'],
    ['const t = performance.now();', 'performance.now()'],
    ['const r = Math.random();', 'Math.random()'],
    ['const id = crypto.randomUUID();', 'crypto.randomUUID()'],
    ['const env = process.env.HOME;', 'process global'],
  ];
  for (const [source, detail] of cases) {
    const findings = analyse(source, 'sample.js');
    assert.equal(findings.length, 1, source);
    assert.equal(findings[0].kind, 'non-determinism', source);
    assert.equal(findings[0].detail, detail, source);
  }
});

test('reports the line number of the violation', () => {
  const source = 'const a = 1;\nconst b = 2;\nconst t = Date.now();\n';
  const [finding] = analyse(source, 'sample.js');
  assert.equal(finding.line, 3);
  assert.equal(finding.file, 'sample.js');
});

/* ---------------------------------------------------- deliberate lookalikes */

test('accepts identifiers that merely look like violations', () => {
  const source = `
    const filepath = 'a/b/c';
    const pathname = url.pathname;
    function process_row(row) { return row; }
    const myrequire = (x) => x;
    const fsLike = { readFileSync: () => '' };
    const paths = ['x'];
    const oscillator = 1;
    const processed = process_row({});
    const dateString = '2026-02-15';
    const randomish = 'Math.random is not called here';
    const notADate = new DateRange();
    const stamped = new Date('2026-02-15T00:00:00Z');
    const parsed = Date.parse('2026-02-15');
    const urls = { info_url: 'https://example.org/' };
    import { readFeed } from './read.js';
    import Papa from 'papaparse';
    import JSZip from 'jszip';
  `;
  assert.deepEqual(analyse(source, 'lookalike.js'), []);
});

test('new Date(argument) is allowed; new Date() is not', () => {
  assert.deepEqual(analyse("const d = new Date('2026-02-15T00:00:00Z');"), []);
  assert.equal(analyse('const d = new Date();').length, 1);
});

/* ----------------------------------------------------------- the real core */

test('the actual core files are clean', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const files = readdirSync('src/core').filter((f) => f.endsWith('.js'));
  assert.ok(files.length > 0);
  for (const file of files) {
    const findings = analyse(readFileSync(`src/core/${file}`, 'utf8'), `src/core/${file}`);
    assert.deepEqual(findings, [], `src/core/${file}`);
  }
});
