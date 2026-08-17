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

const AI_SETTINGS_KEY = "traceflow.ai.settings";

export function saveAiSettings(settings) {
  try {
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

export function loadAiSettings() {
  try {
    const raw = localStorage.getItem(AI_SETTINGS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Scans the first 10 lines of code to extract initial variable declarations/assignments.
 * Returns an array of { name: string, value: string } pairs.
 */
export function extractVariablesFromCode(code) {
  if (!code) return [];
  const lines = code.split("\n");
  const vars = [];
  const regex = /^\s*(?:(?:int|double|float|long|boolean|String|let|const|var|char)\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([^;]+);?\s*$/;
  
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const m = lines[i].trim().match(regex);
    if (m) {
      const name = m[1];
      const val = m[2].trim();
      if (!vars.some((v) => v.name === name)) {
        vars.push({ name, value: val });
      }
    }
  }
  return vars;
}

/**
 * Replaces the initial value of a variable declaration/assignment in the source code.
 */
export function updateVariableInCode(code, varName, newValue) {
  if (!code) return "";
  const declRegex = new RegExp(`(\\b(?:int|double|float|long|boolean|String|let|const|var|char)\\s+${varName}\\s*=\\s*)[^\\n\\r;]+(\\s*;?)`, "g");
  if (declRegex.test(code)) {
    return code.replace(declRegex, `$1${newValue}$2`);
  }
  const assignRegex = new RegExp(`(\\b${varName}\\s*=\\s*)[^\\n\\r;]+(\\s*;?)`, "g");
  if (assignRegex.test(code)) {
    return code.replace(assignRegex, `$1${newValue}$2`);
  }
  return code;
}

/**
 * Rewrite the code to introduce a logical bug for learning purposes.
 */
export function injectBugInCode(code, bugType) {
  if (!code) return "";
  if (bugType === "off_by_one") {
    if (code.includes("<=")) {
      return code.replace(/<=/g, "<");
    } else if (code.includes("<")) {
      return code.replace(/</g, "<=");
    }
  } else if (bugType === "missing_increment") {
    if (code.includes("i++")) {
      return code.replace(/i\+\+/g, "/* i++; (missing increment) */");
    } else if (code.includes("i += 1")) {
      return code.replace(/i \+= 1/g, "# i += 1 (missing increment)");
    } else if (code.includes("i = i + 1")) {
      return code.replace(/i = i \+ 1/g, "// i = i + 1 (missing increment)");
    }
  } else if (bugType === "wrong_comparison") {
    if (code.includes(">")) {
      return code.replace(/>/g, "<");
    } else if (code.includes("<")) {
      return code.replace(/</g, ">");
    }
  }
  return code;
}

/**
 * Prepends a variable declaration to the top of the source code buffer.
 */
export function prependVariableToCode(code, language, varName, value) {
  if (!code) return "";
  let decl = "";
  if (language === "python") {
    decl = `${varName} = ${value}\n`;
  } else if (language === "javascript") {
    decl = `let ${varName} = ${value};\n`;
  } else {
    // java
    let type = "int";
    const valTrim = value.trim();
    if (valTrim === "true" || valTrim === "false") {
      type = "boolean";
    } else if (valTrim.startsWith('"')) {
      type = "String";
    } else if (valTrim.includes(".")) {
      type = "double";
    }
    decl = `${type} ${varName} = ${value};\n`;
  }
  return decl + code;
}

