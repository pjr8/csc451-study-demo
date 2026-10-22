(function (root) {
  'use strict';

  // The catalog is rebuilt from the archive. Only the open worksheet lives in
  // memory; all examples and attempts disappear on refresh.
  const SOURCE = 'backprop-lesson';
  const PARAMS = ['x1', 'x2', 'y', 'w11', 'w12', 'b1', 'w21', 'w22', 'b2', 'v1', 'v2', 'c', 'eta'];
  const BASE = { x1: 2, x2: -1, y: 1, w11: 1, w12: -2, b1: -1, w21: -1, w22: 1, b2: 1, v1: 2, v2: -1, c: -6, eta: .1 };
  const catalog = new Map(), listeners = new Set();
  const copy = value => JSON.parse(JSON.stringify(value));
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
  const engine = () => root.StudyBackpropEngine;
  let sequence = 0;

  function fingerprint(value) {
    const text = String(value); let a = 2166136261, b = 5381;
    for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ text.charCodeAt(i); }
    return `${(a >>> 0).toString(36)}-${(b >>> 0).toString(36)}-${text.length.toString(36)}`;
  }
  function newId() { return root.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${(++sequence).toString(36)}-${Math.random().toString(36).slice(2)}`; }
  function parameterCopy(value) {
    if (!object(value) || PARAMS.some(key => typeof value[key] !== 'number' || !Number.isFinite(value[key]))) return null;
    if (![0, 1].includes(value.y) || value.eta < 0) return null;
    const params = Object.fromEntries(PARAMS.map(key => [key, value[key]]));
    try { if (engine()) engine().compute(params); } catch { return null; }
    return params;
  }
  function sameParameters(a, b) { return PARAMS.every(key => a[key] === b[key]); }
  function normalize(value) {
    if (!object(value) || ![1, 2].includes(value.version)) return null;
    const updatedAt = date(value.updatedAt);
    if (!updatedAt) return null;
    const legacy = value.version === 1;
    const caseId = legacy ? 'base' : value.caseId;
    if (typeof caseId !== 'string' || !caseId || caseId.length > 120) return null;
    const params = parameterCopy(legacy ? engine()?.EXAMPLE || BASE : value.params);
    if (!params) return null;
    if (caseId === 'base' && !sameParameters(params, engine()?.EXAMPLE || BASE)) return null;
    const answers = {};
    if (object(value.answers)) for (const [key, answer] of Object.entries(value.answers)) {
      if (/^[a-zA-Z][a-zA-Z0-9]{0,59}$/.test(key) && typeof answer === 'string') answers[key] = answer.slice(0, 100);
    }
    const step = Number.isInteger(value.step) ? Math.min(9, Math.max(0, value.step)) : 0;
    const visited = [...new Set([0, step, ...(Array.isArray(value.visited) ? value.visited.filter(n => Number.isInteger(n) && n >= 0 && n < 10) : [])])].sort((a, b) => a - b);
    return { version: 2, caseId, params, caseCreatedAt: date(value.caseCreatedAt) || updatedAt,
      title: legacy ? 'Original example' : typeof value.title === 'string' && value.title.trim() ? value.title.slice(0, 140) : caseId === 'base' ? 'Original example' : 'Practice example',
      ...(typeof value.seed === 'string' || Number.isFinite(value.seed) ? { seed: value.seed } : {}),
      updatedAt, step, mode: value.mode === 'practice' ? 'practice' : 'guided', answers, visited,
      checked: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i, value.checked?.[i] === true])),
      revealed: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i, value.revealed?.[i] === true])) };
  }
  function announce() { for (const fn of listeners) { try { fn(); } catch { /* One view must not stop history saving. */ } } }
  function upsert(value, notify = true) {
    const state = normalize(value);
    if (!state) return null;
    let entry = catalog.get(state.caseId);
    if (entry && !sameParameters(entry.facts.params, state.params)) return null;
    if (!entry) {
      entry = { facts: { id: state.caseId, params: copy(state.params), createdAt: state.caseCreatedAt, title: state.title,
        ...(state.seed !== undefined ? { seed: state.seed } : {}) }, state: null, attempts: new Map() };
      catalog.set(state.caseId, entry);
    }
    // A case's starting network is permanent, even after all its weights have
    // been updated. New snapshots can only replace the worksheet progress.
    const canonical = { ...state, params: copy(entry.facts.params), caseCreatedAt: entry.facts.createdAt, title: entry.facts.title };
    if (entry.facts.seed !== undefined) canonical.seed = entry.facts.seed;
    if (!entry.state || Date.parse(canonical.updatedAt) >= Date.parse(entry.state.updatedAt)) {
      const changed = JSON.stringify(entry.state) !== JSON.stringify(canonical);
      entry.state = copy(canonical);
      if (changed && notify) announce();
    }
    return copy(entry.state);
  }
  function remember(value) { return upsert(value); }
  function factsState(facts, at) {
    if (!object(facts)) return null;
    return { version: 2, caseId: facts.id, params: facts.params, caseCreatedAt: facts.createdAt, title: facts.title, seed: facts.seed,
      updatedAt: date(facts.createdAt) || date(at) || new Date(0).toISOString(), step: 0, mode: 'practice', answers: {}, checked: {}, revealed: {}, visited: [0] };
  }
  function addAttempt(event) {
    const p = event.payload, entry = catalog.get(p.caseId);
    if (!entry || !sameParameters(entry.facts.params, parameterCopy(p.params) || {})) return;
    entry.attempts.set(event.id, { id: event.id, questionId: p.questionId, correct: p.answer?.correct === true, at: p.answeredAt || event.at });
  }
  function restore(events) {
    if (!Array.isArray(events)) return list();
    const sorted = events.filter(object).slice().sort((a, b) => Number(a.at || 0) - Number(b.at || 0));
    // Original case records establish immutable givens before later snapshots.
    for (const event of sorted) if (event.type === 'question' && event.payload?.source === SOURCE && event.payload.case) upsert(factsState(event.payload.case, event.at), false);
    for (const event of sorted) {
      const p = event.payload;
      if (!object(p)) continue;
      if (event.type === 'round') {
        const value = p.source === SOURCE ? p.lesson : p.state?.backpropLesson;
        if (value) upsert(value, false);
      }
      if (event.type === 'answer' && p.source === SOURCE) {
        if (!catalog.has(p.caseId) && p.params) upsert(factsState({ id: p.caseId, params: p.params, createdAt: p.caseCreatedAt,
          title: p.caseTitle, seed: p.seed }, event.at), false);
        if (typeof event.id === 'string') addAttempt(event);
      }
    }
    announce();
    return list();
  }
  function record(type, payload, options) {
    // Snapshot before any async storage initialization or network activity.
    const frozenPayload = copy(payload), frozenOptions = copy(options);
    return Promise.resolve({ type, payload: frozenPayload, ...frozenOptions });
  }
  function saveFacts(entry) {
    return record('question', { source: SOURCE, case: entry.facts }, { id: `backprop-case-${fingerprint(entry.facts.id)}`, at: Date.parse(entry.facts.createdAt) });
  }
  function checkpoint(value) {
    const supplied = normalize(value);
    if (!supplied) return Promise.reject(new TypeError('The backpropagation worksheet is invalid.'));
    const state = upsert(supplied);
    if (!state) return Promise.reject(new Error('This example already has different starting values.'));
    const entry = catalog.get(state.caseId);
    // Use the supplied snapshot, not a later live state, for this checkpoint.
    const snapshot = { ...supplied, params: copy(entry.facts.params), caseCreatedAt: entry.facts.createdAt, title: entry.facts.title };
    const payload = { source: SOURCE, roundId: `bp-${state.caseId}`, caseId: state.caseId, lesson: snapshot };
    const options = { id: `backprop-round-${fingerprint(JSON.stringify(payload))}`, at: Date.parse(snapshot.updatedAt) };
    const factSave = saveFacts(entry);
    return factSave.then(() => record('round', payload, options));
  }
  function lessonStep(state, index, supplied) {
    try { return engine()?.buildLesson(state.params)?.steps?.[index] || supplied; } catch { return supplied; }
  }
  function recordAttempt(value, step, checks) {
    const state = normalize(value);
    if (!state || !upsert(state)) return Promise.reject(new Error('The backpropagation example could not be saved.'));
    const index = Number.isInteger(step) ? step : Number.isInteger(step?.index) ? step.index : state.step;
    if (index < 0 || index > 9) return Promise.reject(new RangeError('The backpropagation step is invalid.'));
    const spec = lessonStep(state, index, object(step) ? step : null);
    const supplied = Array.isArray(checks) ? checks : object(checks) ? Object.entries(checks).map(([key, correct]) => ({ key, correct })) : [];
    const byKey = new Map(supplied.filter(object).map(check => [check.key, check]));
    const fields = Array.isArray(spec?.fields) && spec.fields.length ? spec.fields : supplied;
    if (!fields.length) return Promise.reject(new Error('No answers were checked.'));
    const fieldChecks = fields.map(field => {
      const check = byKey.get(field.key) || {};
      return { key: String(field.key), label: String(field.label || check.label || field.key),
        submitted: String(state.answers[field.key] ?? check.answer ?? check.submitted ?? ''),
        expected: typeof field.expected === 'number' ? field.expected : check.expected ?? null,
        correct: check.correct === true || check.met === true, met: check.correct === true || check.met === true };
    });
    const givens = PARAMS.map(key => `${key} = ${state.params[key]}`).join(', ');
    const instruction = `${spec?.title || `Step ${index + 1}`}. ${spec?.lead || ''}`.trim();
    const questionId = `BP-${state.caseId}-${index + 1}`;
    const prompt = `${state.title} · Step ${index + 1}\n${instruction}\nStarting values: ${givens}`;
    const submitted = fieldChecks.map(check => `${check.label} = ${check.submitted || '(blank)'}`).join('\n');
    const expected = spec?.working || fieldChecks.map(check => `${check.label} = ${check.expected}`).join('\n');
    const at = Date.now(), id = `backprop-answer-${newId()}`;
    const question = { id: questionId, displayId: `${state.title} · Step ${index + 1}`, part: 'BP', topic: 'Backpropagation', skillKey: `backprop-step-${index + 1}`, generated: state.caseId !== 'base',
      prompt, context: `Starting values: ${givens}. Hand calculations may round intermediate values to four decimal places; equivalent rounding results are accepted.`, recall: { prompt, answer: expected,
        checklist: fieldChecks.map(check => `${check.label} = ${check.expected}`) } };
    const payload = { source: SOURCE, roundId: `bp-${state.caseId}`, entryKey: questionId, questionId, question, caseId: state.caseId,
      caseCreatedAt: state.caseCreatedAt, caseTitle: state.title, params: copy(state.params), ...(state.seed !== undefined ? { seed: state.seed } : {}),
      step: index, mode: 'backprop', scope: 'backprop', answeredAt: at, displayPrompt: prompt, draft: submitted, fieldChecks,
      answer: { choice: null, correct: fieldChecks.every(check => check.correct), calculated: true, assessed: false,
        rating: fieldChecks.every(check => check.correct) ? 'good' : 'again', submitted, answeredAt: at, archiveEventId: id } };
    const event = { id, type: 'answer', at, payload: copy(payload) };
    addAttempt(event); announce();
    const factSave = saveFacts(catalog.get(state.caseId));
    return factSave.then(() => record('answer', payload, { id, at }));
  }
  function get(caseId) { const state = catalog.get(caseId)?.state; return state ? copy(state) : null; }
  function list() {
    return [...catalog.values()].filter(entry => entry.state).map(entry => {
      const attempts = [...entry.attempts.values()], state = copy(entry.state);
      return { id: state.caseId, caseId: state.caseId, title: state.title, params: copy(entry.facts.params), caseCreatedAt: state.caseCreatedAt,
        updatedAt: state.updatedAt, state, attemptCount: attempts.length, correctCount: attempts.filter(attempt => attempt.correct).length,
        checkedCount: Object.values(state.checked).filter(Boolean).length, visitedCount: state.visited.length,
        lastAttemptAt: attempts.length ? attempts.reduce((latest, attempt) => Math.max(latest, typeof attempt.at === 'number' ? attempt.at : Date.parse(attempt.at) || 0), 0) : null };
    }).sort((a, b) => a.caseId === 'base' ? -1 : b.caseId === 'base' ? 1 : Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.caseId.localeCompare(b.caseId));
  }
  function findQuestion(questionId) {
    if (typeof questionId !== 'string') return null;
    const match = /^BP-(.+)-(10|[1-9])$/.exec(questionId);
    return match && catalog.has(match[1]) ? { caseId: match[1], step: Number(match[2]) - 1 } : null;
  }
  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  const api = Object.freeze({ restore, remember, checkpoint, recordAttempt, list, get, findQuestion, subscribe });
  root.StudyBackpropCases = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
