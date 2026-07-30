'use strict';

/**
 * MSD validation core (v0.1.x) — pure, environment-free.
 *
 * Shared by the reference CLI (validate.js) and the Track C web validator so that
 * both run the SAME validation code path (single authoritative path, structural).
 *
 * No `fs`, no `process`, no `console`: the root schema and the registry code-list
 * schemas are INJECTED by the caller (read from disk by the CLI, inlined by the
 * bundler for the web). Behavior is frozen — see the W1 byte-identical fixture gate.
 */

const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

/**
 * Validate an MSD document against the root schema, with the registry code-list
 * schemas registered by their `$id` so the root schema's `$ref`s resolve
 * (Convention C2).
 *
 * @param {object} doc - the parsed MSD document to validate.
 * @param {{ schema: object, registry: object[] }} opts
 *   - schema: the parsed root structural schema (msd.schema.json).
 *   - registry: array of parsed registry code-list schemas (each with its own `$id`).
 * @returns {{ valid: boolean, errors: object[] }}
 */
function validateMsd(doc, { schema, registry }) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);

  // Register every registry code-list schema by its $id (Convention C2).
  for (const regSchema of registry) {
    ajv.addSchema(regSchema);
  }

  const validate = ajv.compile(schema);
  const valid = validate(doc);
  return { valid, errors: validate.errors || [] };
}

/**
 * Format AJV errors as the exact "<instancePath>: <message>" lines used today.
 * Presentation indentation (if any) is left to the caller, so the CLI and the web
 * render byte-identical message text.
 *
 * @param {object[]} errors - AJV error objects.
 * @returns {string[]}
 */
function formatErrors(errors) {
  return errors.map((e) => `${e.instancePath || '(root)'}: ${e.message}`);
}

module.exports = { validateMsd, formatErrors };
