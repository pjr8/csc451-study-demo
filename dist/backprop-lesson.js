(function (root) {
  'use strict';

  const KEY = (root.StudyStoragePrefix || '') + 'csc451.backprop.lesson.v1';
  const Engine = root.StudyBackpropEngine || (typeof require === 'function' ? require('./backprop-engine.js') : null);
  if (!Engine) throw new Error('Backpropagation engine is unavailable.');
  const Cases = root.StudyBackpropCases || (typeof require === 'function' ? require('./backprop-cases.js') : null);
  const { EXAMPLE, PARAMETERS, SYMBOLS, compute } = Engine;
  let BASE = EXAMPLE, lesson = Engine.buildLesson(BASE);
  let RESULT = lesson.result, F = RESULT.forward, G = RESULT.gradients, STEPS = lesson.steps, FIELDS = lesson.fields;
  function useCase(state) {
    lesson = Engine.buildLesson(state.params);
    BASE = lesson.params; RESULT = lesson.result; F = RESULT.forward; G = RESULT.gradients; STEPS = lesson.steps; FIELDS = lesson.fields;
  }
  const CONNECTIONS = Object.freeze([
    { id: 'w11', source: 'x1', target: 'z1', group: 'Hidden 1', meaning: 'Hidden unit 1 · input 1', upstream: 'dz1', forwardStep: 0, backwardStep: 7 },
    { id: 'w12', source: 'x2', target: 'z1', group: 'Hidden 1', meaning: 'Hidden unit 1 · input 2', upstream: 'dz1', forwardStep: 0, backwardStep: 7 },
    { id: 'w21', source: 'x1', target: 'z2', group: 'Hidden 2', meaning: 'Hidden unit 2 · input 1', upstream: 'dz2', forwardStep: 0, backwardStep: 7 },
    { id: 'w22', source: 'x2', target: 'z2', group: 'Hidden 2', meaning: 'Hidden unit 2 · input 2', upstream: 'dz2', forwardStep: 0, backwardStep: 7 },
    { id: 'v1', source: 'h1', target: 's', group: 'Output', meaning: 'Output weight · hidden unit 1', upstream: 'ds', forwardStep: 2, backwardStep: 5 },
    { id: 'v2', source: 'h2', target: 's', group: 'Output', meaning: 'Output weight · hidden unit 2', upstream: 'ds', forwardStep: 2, backwardStep: 5 }
  ].map(edge => Object.freeze({ ...edge, parameter: edge.id })));
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = Engine.formatNumber;
  const num = value => fmt(value);
  const NODE_ANSWERS = ['z1', 'z2', 'h1', 'h2', 's', 'p', 'L'];
  const AFTER_ANSWERS = { z1: 'afterz1', s: 'afters', p: 'afterp', L: 'afterL' };
  const UPDATE_PARAMETERS = { neww11: 'w11', neww12: 'w12', newv1: 'v1', newc: 'c' };
  let active = null;

  function sanitizeState(s) {
    if (!s || typeof s !== 'object' || ![1, 2].includes(s.version) || typeof s.updatedAt !== 'string' || !Number.isFinite(Date.parse(s.updatedAt))) return null;
    if (s.version === 2 && (!s.params || Object.keys(EXAMPLE).some(key => typeof s.params[key] !== 'number' || !Number.isFinite(s.params[key])))) return null;
    let content;
    try { content = Engine.buildLesson(s.version === 1 ? EXAMPLE : s.params); } catch { return null; }
    const steps = content.steps, fields = content.fields;
    const answers = {};
    for (const step of steps) for (const f of step.fields) if (typeof s.answers?.[f.key] === 'string') answers[f.key] = s.answers[f.key].slice(0, 100);
    const checked = Object.fromEntries(steps.map((step, i) => [i, s.checked?.[i] === true && step.fields.every(f => inputCheck(answers[f.key], f.expected, contextFor(fields[f.key], content)))]));
    const updatedAt = new Date(s.updatedAt).toISOString(), step = Number.isInteger(s.step) ? Math.min(9, Math.max(0, s.step)) : 0;
    const caseId = s.version === 1 ? 'base' : typeof s.caseId === 'string' && s.caseId.length < 120 ? s.caseId : 'base';
    if (caseId === 'base' && Object.keys(EXAMPLE).some(key => content.params[key] !== EXAMPLE[key])) return null;
    return { version: 2, caseId, params: { ...content.params }, title: caseId === 'base' ? 'Original example' : String(s.title || 'Practice network').slice(0, 100),
      caseCreatedAt: Number.isFinite(Date.parse(s.caseCreatedAt)) ? new Date(s.caseCreatedAt).toISOString() : updatedAt,
      ...(typeof s.seed === 'string' || typeof s.seed === 'number' ? { seed: s.seed } : {}), updatedAt, step,
      mode: s.mode === 'practice' ? 'practice' : 'guided', answers, checked,
      visited: [...new Set([step, ...(Array.isArray(s.visited) ? s.visited.filter(i => Number.isInteger(i) && i >= 0 && i < 10) : [])])],
      revealed: Object.fromEntries(steps.map((_, i) => [i, s.revealed?.[i] === true])) };
  }
  function emptyCase(params = EXAMPLE, options = {}) {
    const now = new Date().toISOString();
    return { version: 2, caseId: options.caseId || 'base', title: options.title || 'Original example', params: { ...params },
      ...(options.seed !== undefined ? { seed: options.seed } : {}), caseCreatedAt: now, updatedAt: now, step: 0, mode: options.mode || 'guided', answers: {}, revealed: {}, checked: {}, visited: [0] };
  }
  function readSaved(initial) {
    let local = null;
    try { local = null; } catch { /* Offline storage may be unavailable. */ }
    const restored = sanitizeState(initial);
    if (local && restored) return Date.parse(local.updatedAt) >= Date.parse(restored.updatedAt) ? local : restored;
    return local || restored || emptyCase();
  }
  function snapshot(state) {
    return { version: 2, caseId: state.caseId, title: state.title, params: { ...state.params }, caseCreatedAt: state.caseCreatedAt,
      ...(state.seed !== undefined ? { seed: state.seed } : {}), updatedAt: state.updatedAt, step: state.step, mode: state.mode,
      answers: { ...state.answers }, revealed: { ...state.revealed }, checked: { ...state.checked }, visited: [...(state.visited || [])] };
  }
  function getState() { return active ? snapshot(active) : null; }
  function save(state) {
    state.updatedAt = new Date().toISOString();
    try {
      // State is held in this tab only.
      state.saveError = false;
    } catch { state.saveError = true; }
    try { if (Cases && !Cases.remember(snapshot(state))) state.saveError = true; } catch { state.saveError = true; }
    const label = state.host.querySelector('[data-bp-save]');
    if (label) label.textContent = state.saveError ? 'This tab only' : 'This tab only';
    if (typeof state.onStateChange === 'function') state.onStateChange(snapshot(state));
  }
  function contextFor(f, content = lesson) {
    const owner = f?.owner ?? content.fields[f?.key]?.owner;
    const keys = owner === 9 ? ['afterExact', 'afterRounded', 'afterDisplay', 'afterReference'] : ['exact', 'rounded', 'display'];
    const contexts = keys.map(key => content.contexts?.[key]).filter(Boolean);
    const values = owner === 9 ? content.result.after : content.result.forward;
    return { p: values.p, s: values.s, y: content.params.y,
      answerVariants: content.answerVariants?.[f?.key] || [], alternativeContexts: contexts };
  }
  function isVisible(state, step) { return state.mode === 'guided' ? step <= state.step : !!state.revealed[step] || !!state.checked[step]; }
  function answerContext(f) { return contextFor(f); }
  function caseControls(state) {
    const cases = Cases?.list() || [];
    const entries = cases.length ? cases : [{ ...snapshot(state), id: state.caseId, state: snapshot(state) }];
    return `<section class="bp-case-controls" aria-label="Practice networks"><div class="bp-case-heading"><div><span class="bp-small-label">Current network</span><h2 data-bp-case-title>${escape(state.title)}</h2></div><div class="bp-case-actions"><button type="button" class="bp-button" data-bp-new>New numbers</button><button type="button" class="bp-button secondary" data-bp-original${state.caseId === 'base' ? ' disabled' : ''}>Original example</button></div></div><label class="bp-case-picker"><span>Session examples <small>${entries.length} network${entries.length === 1 ? '' : 's'}</small></span><select data-bp-case aria-label="Session examples">${entries.map(item => {
      const saved = item.state || item, id = item.caseId || item.id || saved.caseId;
      const checked = item.checkedCount ?? Object.values(saved.checked || {}).filter(Boolean).length;
      const attempts = item.attemptCount || 0;
      return `<option value="${escape(id)}"${id === state.caseId ? ' selected' : ''}>${escape(item.title || saved.title)} · ${checked}/10 checked${attempts ? ` · ${attempts} check${attempts === 1 ? '' : 's'}` : ''}</option>`;
    }).join('')}</select></label><p class="bp-case-note">Refresh clears these examples.</p></section>`;
  }
  function checkpoint(state) {
    try { Cases?.checkpoint(snapshot(state))?.catch(() => { state.saveError = true; const label = state.host?.querySelector('[data-bp-save]'); if (label) label.textContent = 'This tab only'; }); } catch { state.saveError = true; }
  }
  function switchCase(state, saved, step) {
    const next = sanitizeState(saved);
    if (!next) return false;
    checkpoint(state);
    Object.assign(state, next, { selectedEdge: null, notice: '', attempted: false });
    if (Number.isInteger(step)) state.step = Math.max(0, Math.min(9, step));
    state.visited = [...new Set([...(state.visited || []), state.step])];
    useCase(state); save(state); checkpoint(state); render(state);
    return true;
  }
  function openCase(caseId, step) {
    if (!active) return false;
    const saved = Cases?.get(caseId) || (caseId === 'base' ? emptyCase() : null);
    return saved ? switchCase(active, saved, step) : false;
  }
  function newCase(state, sameNumbers = false) {
    const random = root.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const params = sameNumbers ? state.params : Engine.generate(random);
    const count = (Cases?.list().length || 1);
    const title = sameNumbers ? `${state.title.replace(/ · retry \d+$/, '')} · retry ${count}` : `Practice ${count}`;
    switchCase(state, emptyCase(params, { caseId: `practice-${random}`, title, seed: sameNumbers ? state.seed : random, mode: 'practice' }));
  }
  function savedGradient(state, parameter) {
    const f = FIELDS[`d${parameter}`], entered = (state.answers[f.key] || '').trim();
    if (isVisible(state, f.owner)) return { text: fmt(f.expected), status: state.checked[f.owner] ? 'Checked' : 'Answer' };
    return { text: entered || '—', status: entered ? 'Your work' : '' };
  }
  function savedGradientReference(state) {
    return `<section class="bp-saved-gradients" aria-label="Earlier gradients"><h3>Earlier gradients</h3><div class="bp-table-scroll"><table><thead><tr><th>Parameter</th><th>Old value</th><th>Gradient</th></tr></thead><tbody>${PARAMETERS.map(parameter => {
      const gradient = savedGradient(state, parameter);
      return `<tr><th>${SYMBOLS[parameter]}</th><td>${fmt(BASE[parameter])}</td><td data-bp-saved-gradient="d${parameter}"><span>${escape(gradient.text)}</span>${gradient.status ? `<small>${gradient.status}</small>` : ''}</td></tr>`;
    }).join('')}</tbody></table></div></section>`;
  }
  function answerInput(state, f) {
    const invalid = state.attempted && f.owner === state.step && !inputCheck(state.answers[f.key], f.expected, answerContext(f));
    const parameter = UPDATE_PARAMETERS[f.key], gradient = parameter ? savedGradient(state, parameter) : null;
    const updateValues = parameter ? `<small class="bp-update-values" data-bp-update-gradient="d${parameter}">Old: ${fmt(BASE[parameter])} · gradient: ${escape(gradient.text)}${gradient.status === 'Your work' ? ' (your work)' : ''}</small>` : '';
    return `<input type="text" maxlength="100" autocomplete="off" spellcheck="false" data-bp-answer="${f.key}" data-bp-owner="${f.owner}" value="${escape(state.answers[f.key] ?? '')}" aria-label="${escape(f.label)}" placeholder="?"${invalid ? ' aria-invalid="true"' : ''}>${updateValues}${isVisible(state, f.owner) ? `<small class="bp-field-result" data-bp-result="${f.key}" data-bp-expected-owner="${f.owner}">= ${fmt(f.expected)}</small>` : ''}`;
  }
  function diagramAnswerForm(state, diagram) {
    const step = STEPS[state.step];
    const embedded = new Set(state.step === 9 ? Object.values(AFTER_ANSWERS) : NODE_ANSWERS);
    const extra = step.fields.filter(f => !embedded.has(f.key));
    const correctCount = step.fields.filter(f => inputCheck(state.answers[f.key], f.expected, answerContext(f))).length;
    const fields = extra.length ? `<div class="bp-diagram-extra"><span class="bp-small-label">Step ${state.step + 1} · ${step.short}</span><div class="bp-answer-grid">${extra.map(f => `<label><span>${f.label}</span>${answerInput(state, FIELDS[f.key])}</label>`).join('')}</div></div>` : '';
    const work = state.step === 8 ? `<div class="bp-update-work">${savedGradientReference(state)}${fields}</div>` : fields;
    const reference = state.step === 9 ? `<details class="bp-details bp-previous-gradients"><summary>Earlier gradients</summary>${savedGradientReference(state)}</details>` : '';
    return `<form class="bp-answer-form bp-diagram-form" aria-label="Step ${state.step + 1} answers">${diagram}${work}${reference}<div class="bp-diagram-check"><div class="bp-answer-actions"><button class="bp-button" type="submit">Check answers</button><button class="bp-button secondary" type="button" data-bp-diagram-next>${state.step === 9 ? 'New numbers' : 'Next step →'}</button><button class="bp-button secondary" type="button" data-bp-reveal>${isVisible(state, state.step) ? 'Hide solution' : 'Reveal step'}</button><span class="bp-tolerance">Step ${state.step + 1}: ${step.fields.map(f => f.label).join(', ')} · expressions accepted</span></div><p class="bp-check-status ${state.attempted && correctCount === step.fields.length ? 'is-correct' : ''}" role="status" aria-live="polite">${escape(state.notice || '')}</p></div></form>`;
  }
  function svgNetwork(state, complete = false) {
    const step = STEPS[state.step], reveal = owner => complete || isVisible(state, owner), back = complete || state.step >= 4;
    const newPass = !complete && state.step === 9;
    const diagramValues = newPass ? RESULT.after : F;
    const shownParameters = !newPass || reveal(8);
    const diagramParams = newPass ? RESULT.updated : BASE;
    const parameter = key => shownParameters ? fmt(diagramParams[key]) : '?';
    const activeNodes = complete ? [] : step.active;
    const reverse = !complete && state.step >= 4 && state.step <= 7;
    const value = (key, owner) => reveal(newPass ? 9 : owner) ? fmt(diagramValues[key]) : '?';
    const grad = (key, owner) => reveal(owner) ? fmt(G[key]) : '?';
    const selected = complete ? null : CONNECTIONS.find(edge => edge.id === state.selectedEdge);
    const editable = !complete && state.mode === 'practice';
    const node = (key, x, y, label, val, subtitle, gradient) => {
      const answerKey = newPass ? AFTER_ANSWERS[key] : NODE_ANSWERS.includes(key) ? key : null;
      const f = editable && answerKey ? FIELDS[answerKey] : null;
      const gradientKey = { z1: 'dz1', z2: 'dz2', h1: 'dh1', h2: 'dh2', s: 'ds' }[key];
      const derived = editable && newPass && !f && NODE_ANSWERS.includes(key) && !reveal(9);
      const display = derived ? (key.startsWith('h') ? `ReLU(${SYMBOLS[key.replace('h', 'z')]})` : 'new value') : val;
      return `<g data-bp-node="${key}" class="bp-node ${f ? 'bp-editable-node' : ''} ${activeNodes.includes(key) ? 'is-active' : ''} ${selected && [selected.source, selected.target].includes(key) ? 'is-connected' : ''} ${['h1', 'h2'].includes(key) && diagramValues[key] === 0 && reveal(newPass ? 9 : 1) ? 'is-closed' : ''}"><rect x="${x}" y="${y}" width="106" height="${editable ? 118 : 96}" rx="10"/><text x="${x + 53}" y="${y + (editable ? 22 : 25)}" class="bp-svg-label">${label}</text>${f ? `<foreignObject x="${x + 6}" y="${y + 28}" width="94" height="76"><div xmlns="http://www.w3.org/1999/xhtml" class="bp-node-answer">${answerInput(state, f)}</div></foreignObject>` : `<text x="${x + 53}" y="${y + (editable ? 66 : 54)}" class="${derived ? 'bp-svg-derived' : 'bp-svg-value'}">${display}</text>`}<text x="${x + 53}" y="${y + (editable ? 110 : 77)}" class="bp-svg-small">${subtitle}</text>${back && gradient ? `<text x="${x + 53}" y="${y + (editable ? 136 : 118)}" class="bp-svg-gradient" data-bp-gradient="${gradientKey}">${gradient}</text>` : ''}</g>`;
    };
    const wire = (a, b, d, key = '', tx = 0, ty = 0) => {
      const chosen = selected?.id === key, label = key ? `${SYMBOLS[key]} = ${parameter(key)}` : '';
      return `<g class="bp-wire ${key ? 'bp-weight' : ''} ${activeNodes.includes(a) && activeNodes.includes(b) ? 'is-active' : ''} ${chosen ? 'is-selected' : ''}"${key && !complete ? ` data-bp-edge="${key}" tabindex="0" role="button" aria-pressed="${chosen}" aria-label="${escape(`${SYMBOLS[key]} = ${parameter(key)}. ${SYMBOLS[a]} to ${SYMBOLS[b]}. Inspect connection`)}"` : ''}>
        ${key ? `<path class="bp-wire-underlay" d="${d}"/>` : ''}<path class="bp-wire-line" d="${d}" marker-${reverse ? 'start' : 'end'}="url(#bp-arrow${complete ? '-full' : ''})"/>
        ${key && !complete ? `<path class="bp-wire-hit" d="${d}"/>` : ''}${label ? `<rect class="bp-weight-pill" x="${tx - 66}" y="${ty - 17}" width="132" height="34" rx="17"/><text class="bp-weight-label" x="${tx}" y="${ty + 5}">${label}</text>` : ''}</g>`;
    };
    const id = complete ? '-full' : '';
    return `<svg class="bp-network-svg ${editable ? 'is-editable' : ''} ${reverse ? 'is-backward' : ''} ${selected ? 'has-edge-selection' : ''}" viewBox="0 0 1238 ${editable ? 430 : 406}" role="${complete ? 'img' : 'group'}" aria-label="Two inputs feed two ReLU hidden units, then one sigmoid output and binary cross-entropy loss. ${complete ? '' : 'Select a labelled weight to inspect its connection.'} ${reverse ? 'Highlighted path shows the backward pass.' : 'Highlighted path shows the current calculation.'}">
      <defs><marker id="bp-arrow${id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"/></marker></defs>
      <text x="73" y="30" class="bp-svg-column">INPUT</text><text x="379" y="30" class="bp-svg-column">WEIGHTED SUM</text><text x="553" y="30" class="bp-svg-column">RELU</text><text x="823" y="30" class="bp-svg-column">LOGIT</text><text x="1013" y="30" class="bp-svg-column">SIGMOID</text><text x="1173" y="30" class="bp-svg-column">LOSS</text>
      ${wire('x1', 'z1', 'M 126 112 L 326 112', 'w11', 221, 112)}${wire('x2', 'z2', 'M 126 286 L 326 286', 'w22', 221, 286)}
      ${wire('x1', 'z2', 'M 126 112 L 326 286', 'w21', 259, 244)}${wire('x2', 'z1', 'M 126 286 L 326 112', 'w12', 259, 153)}
      ${wire('z1', 'h1', 'M 432 112 L 500 112')}${wire('z2', 'h2', 'M 432 286 L 500 286')}
      ${wire('h1', 's', 'M 606 112 L 770 199', 'v1', 687, 120)}${wire('h2', 's', 'M 606 286 L 770 199', 'v2', 687, 282)}
      ${wire('s', 'p', 'M 876 199 L 960 199')}${wire('p', 'L', 'M 1066 199 L 1120 199')}
      ${node('x1', 20, 64, 'x₁', fmt(BASE.x1), 'given', '')}${node('x2', 20, 238, 'x₂', fmt(BASE.x2), 'given', '')}
      ${node('z1', 326, 64, 'z₁', value('z1', 0), `b₁ = ${parameter('b1')}`, newPass ? '' : `∂L/∂z₁ = ${grad('dz1', 6)}`)}${node('z2', 326, 238, 'z₂', value('z2', 0), `b₂ = ${parameter('b2')}`, newPass ? '' : `∂L/∂z₂ = ${grad('dz2', 6)}`)}
      ${node('h1', 500, 64, 'h₁', value('h1', 1), 'max(0, z₁)', newPass ? '' : `∂L/∂h₁ = ${grad('dh1', 6)}`)}${node('h2', 500, 238, 'h₂', value('h2', 1), 'max(0, z₂)', newPass ? '' : `∂L/∂h₂ = ${grad('dh2', 6)}`)}
      ${node('s', 770, 151, 's', value('s', 2), `c = ${parameter('c')}`, newPass ? '' : `∂L/∂s = ${grad('ds', 4)}`)}${node('p', 960, 151, 'p', value('p', 3), 'σ(s)', '')}${node('L', 1120, 151, 'L', value('L', 3), `target y = ${BASE.y}`, '')}
      <text x="619" y="${editable ? 416 : 391}" class="bp-svg-direction">${reverse ? '← BACKWARD: loss gradient × local derivative' : newPass ? 'NEW PARAMETERS: one more forward pass →' : 'FORWARD: inputs → prediction → loss'}</text></svg>`;
  }
  function connectionControls(state) {
    return `<div class="bp-connection-controls"><div class="bp-connection-heading"><span class="bp-small-label">Inspect a connection</span><button type="button" class="bp-all-connections" data-bp-all-connections aria-pressed="${!state.selectedEdge}">All connections</button></div><div class="bp-connection-groups">${['Hidden 1', 'Hidden 2', 'Output'].map(group => `<div class="bp-connection-group"><span>${group}</span><div>${CONNECTIONS.filter(edge => edge.group === group).map(edge => `<button type="button" data-bp-edge-button="${edge.id}" aria-pressed="${state.selectedEdge === edge.id}" aria-controls="bp-edge-inspector"><strong>${SYMBOLS[edge.id]}</strong><span>${SYMBOLS[edge.source]} → ${SYMBOLS[edge.target]}</span></button>`).join('')}</div></div>`).join('')}</div></div><div class="bp-edge-inspector" id="bp-edge-inspector" role="region" aria-label="Selected connection" aria-live="polite">${connectionInspector(state)}</div>`;
  }
  function connectionInspector(state) {
    const edge = CONNECTIONS.find(item => item.id === state.selectedEdge);
    if (!edge) return '<p class="bp-edge-placeholder">Select a weight on the diagram or below it.</p>';
    const newPass = state.step === 9, parameterKnown = !newPass || isVisible(state, 8);
    const params = newPass ? RESULT.updated : BASE, values = newPass ? RESULT.after : F;
    const symbol = SYMBOLS[edge.id], source = SYMBOLS[edge.source], target = SYMBOLS[edge.target];
    const input = edge.source.startsWith('x') ? params[edge.source] : values[edge.source];
    const contributionKnown = parameterKnown && isVisible(state, newPass ? 9 : edge.forwardStep);
    const backwardKnown = isVisible(state, edge.backwardStep);
    const oldInput = edge.source.startsWith('x') ? BASE[edge.source] : F[edge.source];
    const forward = `${symbol} × ${source}${contributionKnown ? `\n= (${fmt(params[edge.id])})(${fmt(input)}) = ${fmt(params[edge.id] * input)}` : ''}`;
    const backward = `∂L/∂${symbol} = (∂L/∂${target})${source}${backwardKnown ? `\n= (${fmt(G[edge.upstream])})(${fmt(oldInput)}) = ${fmt(G[`d${edge.id}`])}` : ''}`;
    return `<div class="bp-edge-summary"><div><h3>${symbol} = ${parameterKnown ? fmt(params[edge.id]) : '?'}</h3><p class="bp-edge-route">${source} <span aria-hidden="true">→</span> ${target}</p></div><p class="bp-edge-meaning">${edge.meaning}${newPass ? '<span>After the update</span>' : ''}</p></div><div class="bp-edge-math"><div><span class="bp-small-label">Forward contribution</span><pre class="bp-equation bp-edge-forward">${escape(forward)}</pre></div><div><span class="bp-small-label">${newPass ? 'Gradient used for update' : 'Backward weight gradient'}</span><pre class="bp-equation bp-edge-backward">${escape(backward)}</pre></div></div>`;
  }
  function selectConnection(state, id) {
    const edge = CONNECTIONS.find(item => item.id === id);
    state.selectedEdge = edge?.id || null;
    const svg = state.host.querySelector('.bp-network-svg');
    svg?.classList.toggle('has-edge-selection', !!edge);
    for (const item of state.host.querySelectorAll('[data-bp-edge]')) {
      const selected = item.dataset.bpEdge === state.selectedEdge;
      item.classList.toggle('is-selected', selected);
      item.setAttribute('aria-pressed', String(selected));
    }
    for (const item of state.host.querySelectorAll('[data-bp-edge-button]')) item.setAttribute('aria-pressed', String(item.dataset.bpEdgeButton === state.selectedEdge));
    for (const item of state.host.querySelectorAll('[data-bp-node]')) item.classList.toggle('is-connected', !!edge && [edge.source, edge.target].includes(item.dataset.bpNode));
    state.host.querySelector('[data-bp-all-connections]')?.setAttribute('aria-pressed', String(!edge));
    const inspector = state.host.querySelector('.bp-edge-inspector');
    if (inspector) inspector.innerHTML = connectionInspector(state);
  }
  function toggleConnection(state, id) {
    selectConnection(state, state.selectedEdge === id ? null : id);
  }
  function givenTable() {
    const rows = [['x1', 'w11', 'w21', 'v1'], ['x2', 'w12', 'w22', 'v2'], ['y', 'b1', 'b2', 'c']];
    return `<div class="bp-table-scroll"><table class="bp-given"><caption>Starting values · fixed for this example · 4 decimal places</caption><thead><tr><th colspan="2">Input</th><th colspan="2">Hidden 1</th><th colspan="2">Hidden 2</th><th colspan="2">Output</th></tr></thead><tbody>${rows.map(row => `<tr>${row.map(key => `<th>${SYMBOLS[key] || key}</th><td data-bp-given="${key}">${fmt(BASE[key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="bp-table-note">Learning rate η = ${fmt(BASE.eta)} · ReLU′(0) = 0</p>`;
  }
  function gradientTable(update = false) {
    const activations = { w11: `x₁ = ${fmt(BASE.x1)}`, w12: `x₂ = ${fmt(BASE.x2)}`, b1: '1', w21: `x₁ = ${fmt(BASE.x1)}`, w22: `x₂ = ${fmt(BASE.x2)}`, b2: '1', v1: `h₁ = ${fmt(F.h1)}`, v2: `h₂ = ${fmt(F.h2)}`, c: '1' };
    const upstream = name => fmt(name.startsWith('w1') || name === 'b1' ? G.dz1 : name.startsWith('w2') || name === 'b2' ? G.dz2 : G.ds);
    return `<div class="bp-table-scroll"><table class="bp-gradient-table"><caption>${update ? `All nine simultaneous updates · η = ${fmt(BASE.eta)}` : 'All nine parameter gradients'}</caption><thead><tr><th>Parameter</th>${update ? '<th>Old</th><th>Gradient</th><th>New = old − η × gradient</th>' : '<th>Upstream</th><th>Input</th><th>Gradient</th>'}</tr></thead><tbody>${PARAMETERS.map(name => `<tr><th>${SYMBOLS[name]}</th>${update ? `<td>${fmt(BASE[name])}</td><td>${fmt(G[`d${name}`])}</td><td>${fmt(RESULT.updated[name])}</td>` : `<td>${upstream(name)}</td><td>${activations[name]}</td><td>${fmt(G[`d${name}`])}</td>`}</tr>`).join('')}</tbody></table></div>`;
  }
  function workedSheet() {
    return `<div class="bp-worked-sheet"><h3>Forward pass</h3><pre class="bp-equation">${escape(STEPS.slice(0, 4).map(s => s.working).join('\n\n'))}</pre><h3>Backward pass</h3><pre class="bp-equation">${escape(STEPS.slice(4, 8).map(s => s.working).join('\n\n'))}</pre>${gradientTable(true)}<h3>After the update</h3><pre class="bp-equation">${escape(STEPS[9].working)}</pre></div>`;
  }
  function parseAnswer(value, context = {}) {
    // Parse a small math grammar; student text is never executed as JavaScript.
    const text = String(value ?? '').replace(/\s/g, '').replace(/−/g, '-').replace(/[×·]/g, '*').replace(/÷/g, '/').toLowerCase();
    if (!text || text.length > 100) return NaN;
    const scope = { p: F.p, s: F.s, y: BASE.y, ...context };
    let cursor = 0;
    const guard = depth => { if (depth > 32) throw Error('Expression is too deep.'); };
    function sum(depth) {
      guard(depth); let result = product(depth + 1);
      while (text[cursor] === '+' || text[cursor] === '-') {
        const operator = text[cursor++], right = product(depth + 1);
        result = operator === '+' ? result + right : result - right;
      }
      return result;
    }
    function product(depth) {
      guard(depth); let result = unary(depth + 1);
      while (text[cursor] === '*' || text[cursor] === '/') {
        const operator = text[cursor++], right = unary(depth + 1);
        if (operator === '/' && right === 0) throw Error('Division by zero.');
        result = operator === '*' ? result * right : result / right;
      }
      return result;
    }
    function unary(depth) {
      guard(depth);
      if (text[cursor] === '+' || text[cursor] === '-') { const sign = text[cursor++]; const result = unary(depth + 1); return sign === '-' ? -result : result; }
      return atom(depth + 1);
    }
    function atom(depth) {
      guard(depth);
      if (text[cursor] === '(') { cursor++; const result = sum(depth + 1); if (text[cursor++] !== ')') throw Error('Missing parenthesis.'); return result; }
      const number = /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/.exec(text.slice(cursor));
      if (number) { cursor += number[0].length; return Number(number[0]); }
      const identifier = /^[a-zσ]+/.exec(text.slice(cursor));
      if (!identifier) throw Error('Expected a number.');
      const name = identifier[0]; cursor += name.length;
      if (['p', 's', 'y'].includes(name)) { if (!Number.isFinite(scope[name])) throw Error('Unknown value.'); return scope[name]; }
      if (!['ln', 'log', 'sigmoid', 'σ'].includes(name)) throw Error('Unknown function.');
      let argument;
      if (text[cursor] === '(') { cursor++; argument = sum(depth + 1); if (text[cursor++] !== ')') throw Error('Missing parenthesis.'); }
      else if (name === 'ln' || name === 'log') argument = unary(depth + 1);
      else throw Error('Missing parenthesis.');
      if (!Number.isFinite(argument)) throw Error('Invalid argument.');
      return name === 'ln' || name === 'log' ? (argument > 0 ? Math.log(argument) : NaN) : argument >= 0 ? 1 / (1 + Math.exp(-argument)) : Math.exp(argument) / (1 + Math.exp(argument));
    }
    try { const result = sum(0); return cursor === text.length && Number.isFinite(result) ? result : NaN; }
    catch { return NaN; }
  }
  function inputCheck(value, expected, context) {
    const targets = [expected, ...(context?.answerVariants || [])].filter(Number.isFinite);
    const contexts = [context, ...(context?.alternativeContexts || [])];
    return contexts.some(scope => {
      const entered = parseAnswer(value, scope);
      return Number.isFinite(entered) && targets.some(target => Math.abs(entered - target) <= Math.max(.0005, Math.abs(target) * .001));
    });
  }
  function checkField(value, key, params = EXAMPLE) {
    const content = Engine.buildLesson(params), f = content.fields[key];
    return !!f && inputCheck(value, f.expected, contextFor(f, content));
  }
  function render(state, focus = false) {
    const previousScroll = state.host.querySelector('.bp-network-scroll')?.scrollLeft || 0;
    const focused = state.host.ownerDocument.activeElement;
    const activeAnswer = state.host.contains(focused) ? focused?.dataset?.bpAnswer : null;
    const selection = activeAnswer ? [focused.selectionStart, focused.selectionEnd] : null;
    const activeCheck = state.host.contains(focused) && focused?.matches?.('.bp-diagram-check button[type="submit"]');
    const activeReveal = state.host.contains(focused) && focused?.hasAttribute?.('data-bp-reveal');
    const step = STEPS[state.step], shown = isVisible(state, state.step), practice = state.mode === 'practice';
    const diagram = `<div class="bp-network-scroll" tabindex="0" aria-label="Scrollable network diagram">${svgNetwork(state)}</div><p class="bp-scroll-hint">Scroll to see every node.</p>`;
    state.host.innerHTML = `<article class="bp-root backprop-root" aria-labelledby="bp-title">
      <header class="bp-header"><div><span class="bp-eyebrow">Learn / neural networks</span><h1 id="bp-title">Backpropagation, by hand</h1><p>One network. Forward, backward, update.</p></div><span class="bp-save" data-bp-save role="status">${state.saveError ? 'This tab only' : 'This tab only'}</span></header>
      <div class="bp-controls"><div class="bp-mode" role="group" aria-label="Lesson mode"><button type="button" data-bp-mode="guided" aria-pressed="${!practice}">Walkthrough</button><button type="button" data-bp-mode="practice" aria-pressed="${practice}">Try by hand</button></div><button type="button" class="bp-text-link" data-bp-sheet>Reference sheet ↓</button></div>
      ${caseControls(state)}
      <details class="bp-details bp-givens" open><summary>Given values</summary>${givenTable()}</details>
      <section class="bp-network" aria-label="Network diagram"><div class="bp-network-caption"><span>${step.phase === 'Backward' ? 'Backward pass' : step.phase === 'Forward' ? 'Forward pass' : step.phase}</span><span>${practice ? 'Type in the boxes · check this step below' : 'Click a weight to trace its connection'}</span></div>${practice ? diagramAnswerForm(state, diagram) : diagram + (state.step >= 8 ? savedGradientReference(state) : '')}${connectionControls(state)}</section>
      <nav class="bp-step-nav" aria-label="Backpropagation steps">${STEPS.map((s, i) => `<button type="button" data-bp-step="${i}" ${i === state.step ? 'aria-current="step"' : ''} aria-label="Step ${i + 1}: ${s.short}${state.checked[i] ? ', checked' : ''}"><span>${state.checked[i] ? '✓' : String(i + 1).padStart(2, '0')}</span><small>${s.short}</small></button>`).join('')}</nav>
      <section class="bp-current" aria-labelledby="bp-step-title"><header class="bp-step-heading"><span class="bp-eyebrow">${step.phase} · ${state.step + 1} / 10</span><h2 id="bp-step-title" tabindex="-1">${step.title}</h2><p>${step.lead}</p></header>
        <div class="bp-calculation"><div><span class="bp-small-label">Rule</span><pre class="bp-equation">${escape(step.formula)}</pre></div>${shown ? `<div class="bp-working"><span class="bp-small-label">Substitute</span><pre class="bp-equation">${escape(step.working)}</pre></div>` : '<div class="bp-working is-hidden"><span class="bp-small-label">Your turn</span><p>Use the rule and the saved forward values.</p></div>'}</div>
        ${!practice ? `<div class="bp-results">${step.fields.map(f => `<div><span>${f.label}</span><strong>${fmt(f.expected)}</strong></div>`).join('')}</div>` : ''}
        <details class="bp-details bp-why"${!practice ? ' open' : ''}><summary>Why this works</summary><div>${step.why}</div></details>
        <details class="bp-details"><summary>Common mistake</summary><p>${escape(step.mistake)}</p></details>
        ${shown && state.step === 7 ? gradientTable() : ''}${shown && state.step === 8 ? gradientTable(true) : ''}
        ${shown && state.step === 9 ? `<div class="bp-loss-check"><div><span>Before</span><strong>${fmt(F.L)}</strong></div><span aria-hidden="true">→</span><div><span>After</span><strong>${fmt(RESULT.after.L)}</strong></div><span class="bp-loss-drop">${Math.abs(Math.round((1 - RESULT.after.L / F.L) * 100))}% ${RESULT.after.L <= F.L ? 'lower' : 'higher'} loss</span></div>` : ''}
        <footer class="bp-step-actions"><button type="button" class="bp-button secondary" data-bp-prev ${state.step === 0 ? 'disabled' : ''}>← Back</button><span>${state.step + 1} of 10</span><button type="button" class="bp-button" ${state.step === 9 ? 'data-bp-quiz' : 'data-bp-next'}>${state.step === 9 ? 'Practice Part C →' : 'Next step →'}</button></footer>
      </section>
      <section class="bp-reference" id="bp-sheet" aria-labelledby="bp-reference-title"><header><span class="bp-eyebrow">Keep beside your paper</span><h2 id="bp-reference-title">The hand-calculation checklist</h2></header><ol class="bp-checklist"><li><strong>Forward</strong><span>weighted sums → ReLU → output score → sigmoid → loss</span></li><li><strong>Backward</strong><span>p − y → output weights → hidden activations → ReLU gates → hidden weights</span></li><li><strong>Update</strong><span>new = old − η × gradient; use all old weights for backprop</span></li><li><strong>Check</strong><span>rerun forward with the new weights; compare loss</span></li></ol>
        <details class="bp-details"><summary>All worked numbers · reveals the complete solution</summary>${workedSheet()}</details>
        <details class="bp-details"><summary>Optional: input gradients and the sum rule</summary><p>If a value feeds several paths, add the gradient contributions from every path. Both hidden units depend on each input.</p><pre class="bp-equation">∂L/∂x₁ = (∂L/∂z₁)w₁₁ + (∂L/∂z₂)w₂₁\n          = (${fmt(G.dz1)})(${fmt(BASE.w11)}) + (${fmt(G.dz2)})(${fmt(BASE.w21)}) = ${fmt(RESULT.inputGradients.dx1)}\n∂L/∂x₂ = (∂L/∂z₁)w₁₂ + (∂L/∂z₂)w₂₂\n          = (${fmt(G.dz1)})(${fmt(BASE.w12)}) + (${fmt(G.dz2)})(${fmt(BASE.w22)}) = ${fmt(RESULT.inputGradients.dx2)}</pre><p>Inputs are given data here, so gradient descent does not update them. This sum rule also applies to shared parameters or hidden values that feed several later units.</p></details>
        <details class="bp-details"><summary>ReLU &amp; the chain rule · illustrated</summary><figure class="bp-illustration"><button type="button" data-bp-image aria-label="Enlarge ReLU and gradient illustration"><img src="assets/backprop-relu-guide.png" alt="Illustrated guide to a ReLU gate: positive inputs pass forward and allow gradients backward; negative inputs output zero and block the backward gradient." loading="lazy" decoding="async"></button><figcaption>The exact numbers and calculations are in the walkthrough above.</figcaption></figure></details>
        <details class="bp-details"><summary>References</summary><p>The derivation uses sigmoid with <a href="https://docs.pytorch.org/docs/stable/generated/torch.nn.BCEWithLogitsLoss.html" target="_blank" rel="noopener noreferrer">binary cross-entropy</a> and the <a href="https://docs.pytorch.org/tutorials/beginner/blitz/autograd_tutorial.html" target="_blank" rel="noopener noreferrer">chain rule</a>. The handwritten steps above expose the derivatives that automatic differentiation normally computes.</p></details>
        <div class="bp-reference-actions"><button type="button" class="bp-button secondary" data-bp-download>Download network SVG</button><button type="button" class="bp-text-button" data-bp-retry>Try these numbers again</button></div>
      </section>
      <dialog class="bp-image-dialog" aria-label="Enlarged backpropagation illustration"><button type="button" class="bp-button secondary" data-bp-close>Close ×</button><img alt="ReLU and the chain rule illustration"></dialog>
    </article>`;
    if (root.LESSON_BACKPROP_IMAGES?.relu || root.BACKPROP_IMAGE) {
      const img = state.host.querySelector('.bp-illustration img');
      img.src = root.LESSON_BACKPROP_IMAGES?.relu || root.BACKPROP_IMAGE;
    }
    const scroller = state.host.querySelector('.bp-network-scroll');
    if (scroller) scroller.scrollLeft = previousScroll;
    if (focus) {
      state.host.querySelector('#bp-step-title').focus({ preventScroll: true });
      const currentInput = state.host.querySelector(`[data-bp-answer="${step.fields[0].key}"]`);
      if (scroller && currentInput && scroller.contains(currentInput)) {
        const view = scroller.getBoundingClientRect(), field = currentInput.getBoundingClientRect();
        if (field.left < view.left || field.right > view.right) scroller.scrollLeft += field.left - view.left - 32;
      }
    } else if (activeAnswer) {
      const input = state.host.querySelector(`[data-bp-answer="${activeAnswer}"]`);
      if (input) { input.focus({ preventScroll: true }); input.setSelectionRange(...selection); }
    } else if (activeCheck || activeReveal) {
      state.host.querySelector(activeCheck ? '.bp-diagram-check button[type="submit"]' : '[data-bp-reveal]')?.focus({ preventScroll: true });
    }
  }
  function move(state, next) {
    state.step = Math.min(9, Math.max(0, next)); state.visited = [...new Set([...(state.visited || []), state.step])]; state.notice = ''; state.attempted = false; save(state); render(state, true);
    const header = state.host.querySelector('.bp-network');
    if (header) header.scrollIntoView({ behavior: root.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }
  function unmount() {
    if (!active) return;
    checkpoint(active);
    active.host.removeEventListener('click', active.click);
    active.host.removeEventListener('input', active.input);
    active.host.removeEventListener('change', active.change);
    active.host.removeEventListener('submit', active.submit);
    active.host.removeEventListener('keydown', active.keydown);
    const dialog = active.host.querySelector('.bp-image-dialog');
    if (dialog?.open) dialog.close();
    active = null;
  }
  function mount(host, options = {}) {
    if (!host || typeof host.querySelector !== 'function') throw new TypeError('A lesson host is required.');
    unmount();
    const state = { host, ...readSaved(options.initialState), selectedEdge: null, onPractice: options.onPractice, onStateChange: options.onStateChange, notice: '', attempted: false };
    useCase(state);
    if (Cases && !Cases.get('base')) Cases.remember(state.caseId === 'base' ? snapshot(state) : emptyCase());
    state.click = event => {
      if (event.target.closest('input, select, textarea, [contenteditable="true"]')) return;
      const connection = event.target.closest('[data-bp-edge], [data-bp-edge-button]');
      if (connection && host.contains(connection)) { toggleConnection(state, connection.dataset.bpEdge || connection.dataset.bpEdgeButton); return; }
      if (state.selectedEdge && event.target.closest('.bp-network-svg')) { selectConnection(state, null); return; }
      const target = event.target.closest('button');
      if (!target || !host.contains(target)) return;
      if (target.hasAttribute('data-bp-all-connections')) selectConnection(state, null);
      else if (target.hasAttribute('data-bp-new')) newCase(state);
      else if (target.hasAttribute('data-bp-original')) openCase('base');
      else if (target.hasAttribute('data-bp-retry')) newCase(state, true);
      else if (target.hasAttribute('data-bp-step')) move(state, Number(target.dataset.bpStep));
      else if (target.hasAttribute('data-bp-prev')) move(state, state.step - 1);
      else if (target.hasAttribute('data-bp-next')) move(state, state.step + 1);
      else if (target.hasAttribute('data-bp-diagram-next')) { if (state.step === 9) newCase(state); else move(state, state.step + 1); }
      else if (target.hasAttribute('data-bp-mode')) { state.mode = target.dataset.bpMode === 'practice' ? 'practice' : 'guided'; state.notice = ''; state.attempted = false; save(state); render(state); }
      else if (target.hasAttribute('data-bp-reveal')) { const wasShown = isVisible(state, state.step); state.revealed[state.step] = !wasShown; if (wasShown) state.checked[state.step] = false; state.notice = !wasShown ? 'Solution revealed.' : 'Solution hidden.'; state.attempted = false; save(state); render(state); }
      else if (target.hasAttribute('data-bp-quiz')) { if (typeof state.onPractice === 'function') state.onPractice(); }
      else if (target.hasAttribute('data-bp-sheet')) host.querySelector('#bp-sheet').scrollIntoView({ behavior: root.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      else if (target.hasAttribute('data-bp-image')) { const dialog = host.querySelector('.bp-image-dialog'); dialog.querySelector('img').src = host.querySelector('.bp-illustration img').src; dialog.showModal(); }
      else if (target.hasAttribute('data-bp-close')) host.querySelector('.bp-image-dialog').close();
      else if (target.hasAttribute('data-bp-download')) {
        const css = '<style>text{font-family:Arial,sans-serif;text-anchor:middle;fill:#202720}.bp-node rect{fill:#f9faf7;stroke:#c6ccc0;stroke-width:1.5}.bp-svg-label{font-size:16px;font-weight:700}.bp-svg-value{font-size:20px;font-weight:700}.bp-svg-small{font-size:12px}.bp-svg-column{font-size:10px;letter-spacing:1px}.bp-svg-gradient{font-size:12px;fill:#253abd}.bp-svg-direction{font-size:12px;fill:#253abd}.bp-wire path{fill:none;stroke:#899281;stroke-width:1.8}.bp-wire .bp-wire-underlay{stroke:#fff;stroke-width:7}.bp-weight-pill{fill:#fff;stroke:#b0b8a9;stroke-width:1.3}.bp-weight-label{font-size:14px;font-weight:600}</style>';
        const markup = svgNetwork(state, true).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ').replace('<defs>', css + '<defs>');
        const blob = new root.Blob([markup], { type: 'image/svg+xml' }); const url = root.URL.createObjectURL(blob), a = host.ownerDocument.createElement('a');
        a.href = url; a.download = state.caseId === 'base' ? 'backpropagation-worked-network.svg' : `${state.caseId}-backpropagation.svg`; a.click(); root.setTimeout(() => root.URL.revokeObjectURL(url), 1000);
      }
    };
    state.change = event => {
      if (event.target.matches('[data-bp-case]')) openCase(event.target.value);
    };
    state.input = event => {
      const target = event.target.closest('[data-bp-answer]');
      if (!target) return;
      const f = FIELDS[target.dataset.bpAnswer];
      if (!f) return;
      state.answers[f.key] = target.value.slice(0, 100);
      state.checked[f.owner] = false;
      if (f.owner === state.step) {
        state.attempted = false; state.notice = '';
        const status = host.querySelector('.bp-check-status');
        if (status) { status.textContent = ''; status.classList.remove('is-correct'); }
      }
      for (const input of host.querySelectorAll(`[data-bp-owner="${f.owner}"]`)) input.removeAttribute('aria-invalid');
      if (!isVisible(state, f.owner)) for (const result of host.querySelectorAll(`[data-bp-expected-owner="${f.owner}"]`)) result.hidden = true;
      const nav = host.querySelector(`[data-bp-step="${f.owner}"]`);
      if (nav) {
        nav.querySelector('span').textContent = String(f.owner + 1).padStart(2, '0');
        nav.setAttribute('aria-label', `Step ${f.owner + 1}: ${STEPS[f.owner].short}`);
      }
      // Update only feedback, never replace an input while the user is typing.
      for (const label of host.querySelectorAll('[data-bp-gradient]')) {
        const gradient = FIELDS[label.dataset.bpGradient];
        if (gradient?.owner === f.owner) label.textContent = `${gradient.label} = ${isVisible(state, f.owner) ? fmt(gradient.expected) : '?'}`;
      }
      const inspector = host.querySelector('.bp-edge-inspector');
      if (inspector && state.selectedEdge) inspector.innerHTML = connectionInspector(state);
      save(state);
    };
    state.submit = event => {
      if (!event.target.matches('.bp-answer-form')) return;
      event.preventDefault(); const fields = STEPS[state.step].fields, count = fields.filter(f => inputCheck(state.answers[f.key], f.expected, answerContext(f))).length;
      state.checked[state.step] = count === fields.length; state.attempted = true;
      state.notice = count === fields.length ? `Correct · ${count} of ${fields.length}.` : `${count} of ${fields.length} correct. Recheck the marked fields.`;
      const wrongLoss = fields.find(f => ['L', 'afterL'].includes(f.key) && !inputCheck(state.answers[f.key], f.expected, answerContext(f)));
      if (wrongLoss) state.notice += ` Loss is ${BASE.y === 1 ? '−ln(p)' : '−ln(1 − p)'} for y = ${BASE.y}; y − p is not the loss.`;
      else if (fields.some(f => f.key === 'ds' && !inputCheck(state.answers[f.key], f.expected, answerContext(f)))) state.notice += ' The output gradient is p − y.';
      try { Cases?.recordAttempt(snapshot(state), state.step, fields.map(f => ({ key: f.key, label: f.label, answer: state.answers[f.key] || '', expected: f.expected, correct: inputCheck(state.answers[f.key], f.expected, answerContext(f)) })))?.catch(() => { state.saveError = true; const label = state.host.querySelector('[data-bp-save]'); if (label) label.textContent = 'This tab only'; }); } catch { state.saveError = true; }
      save(state); render(state);
    };
    state.keydown = event => {
      if (event.key === 'Escape' && state.selectedEdge && !host.querySelector('dialog[open]')) { event.preventDefault(); selectConnection(state, null); return; }
      const connection = event.target.closest('[data-bp-edge]');
      if (connection && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); toggleConnection(state, connection.dataset.bpEdge); return; }
      const button = event.target.closest('[data-bp-step]');
      if (!button || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); const index = Number(button.dataset.bpStep), next = event.key === 'Home' ? 0 : event.key === 'End' ? 9 : Math.min(9, Math.max(0, index + (event.key === 'ArrowRight' ? 1 : -1)));
      move(state, next); host.querySelector(`[data-bp-step="${next}"]`).focus({ preventScroll: true });
    };
    active = state;
    host.addEventListener('click', state.click); host.addEventListener('input', state.input); host.addEventListener('change', state.change); host.addEventListener('submit', state.submit); host.addEventListener('keydown', state.keydown);
    save(state); render(state);
  }
  const api = Object.freeze({ EXAMPLE, PARAMETERS, CONNECTIONS, get STEPS() { return STEPS; }, compute, parseAnswer, inputCheck, checkField, sanitizeState, getState, openCase, mount, unmount });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.StudyBackprop = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
