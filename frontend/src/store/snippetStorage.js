/**
 * Tiny wrapper around localStorage used to persist per-sample code drafts.
 *
 * We only persist the DELTA from the loaded sample's canonical code, so
 * changing a sample's code later (or having no stored value at all) means
 * the sample opens clean — no stale data.
 */

const NS = "traceflow.snippet.";
const LANG_NS = "traceflow.lang.";

function key(sampleId) {
  return `${NS}${sampleId}`;
}

function langKey(sampleId) {
  return `${LANG_NS}${sampleId}`;
}

export function saveSnippet(sampleId, code) {
  if (!sampleId) return;
  try {
    localStorage.setItem(key(sampleId), code);
  } catch {
    /* quota / disabled — ignore */
  }
}

export function loadSnippet(sampleId) {
  if (!sampleId) return null;
  try {
    return localStorage.getItem(key(sampleId));
  } catch {
    return null;
  }
}

export function clearSnippet(sampleId) {
  if (!sampleId) return;
  try {
    localStorage.removeItem(key(sampleId));
  } catch {
    /* ignore */
  }
}

export function saveLanguage(sampleId, lang) {
  if (!sampleId) return;
  try {
    localStorage.setItem(langKey(sampleId), lang);
  } catch {
    /* ignore */
  }
}

export function loadLanguage(sampleId) {
  if (!sampleId) return null;
  try {
    return localStorage.getItem(langKey(sampleId));
  } catch {
    return null;
  }
}

export function clearLanguage(sampleId) {
  if (!sampleId) return;
  try {
    localStorage.removeItem(langKey(sampleId));
  } catch {
    /* ignore */
  }
}
