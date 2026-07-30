/**
 * validate.js — validation hook (P1.5)
 *
 * Pure, and deliberately thin. The validator is **injected**, never imported
 * here: vendor/msd/core.js is CommonJS, this repository is ESM, and the core
 * must stay browser-portable. The shim vendor/msd/core.mjs handles the interop
 * and lives outside src/core/** for that reason.
 *
 * The 14 registry code-list schemas are registered by their $id (Convention
 * C2) — which the vendored validator does itself, given the array. A
 * hand-rolled AJV with $ref resolution is forbidden: the $ids are https://
 * URLs and resolving them would reach the network.
 *
 * Messages are the validator's own, unmodified.
 */

/**
 * @param {object} doc  the MSD document to validate
 * @param {{validateMsd: Function, formatErrors?: Function, schema: object, registry: object[]}} injected
 * @returns {{valid: boolean, errors: object[], messages: string[]}}
 */
export function validateDocument(doc, injected) {
  const { validateMsd, formatErrors, schema, registry } = injected ?? {};

  if (typeof validateMsd !== 'function') {
    throw new TypeError('validateDocument requires an injected validateMsd function');
  }
  if (schema === undefined || registry === undefined) {
    throw new TypeError('validateDocument requires the injected schema and registry');
  }

  const { valid, errors } = validateMsd(doc, { schema, registry });

  const messages = typeof formatErrors === 'function'
    ? formatErrors(errors)
    : errors.map((e) => `${e.instancePath || '(root)'}: ${e.message}`);

  return { valid, errors, messages };
}
