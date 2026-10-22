(function (root) {
  'use strict';

  const FIELD_KEYS = Object.freeze([
    'z1', 'h1', 'z2', 'h2', 's', 'p', 'L',
    'ds', 'dv1', 'dv2', 'dc', 'dh1', 'dh2', 'dz1', 'dz2',
    'dw11', 'dw12', 'db1', 'dw21', 'dw22', 'db2'
  ]);
  const GRADIENTS = [
    ['ds', 's', 'output logit s'], ['dv1', 'v₁', 'output weight v1'],
    ['dv2', 'v₂', 'output weight v2'], ['dc', 'c', 'output bias c'],
    ['dh1', 'h₁', 'hidden activation h1'], ['dh2', 'h₂', 'hidden activation h2'],
    ['dz1', 'z₁', 'hidden pre-activation z1'], ['dz2', 'z₂', 'hidden pre-activation z2'],
    ['dw11', 'w₁₁', 'hidden weight w11'], ['dw12', 'w₁₂', 'hidden weight w12'],
    ['db1', 'b₁', 'hidden bias b1'], ['dw21', 'w₂₁', 'hidden weight w21'],
    ['dw22', 'w₂₂', 'hidden weight w22'], ['db2', 'b₂', 'hidden bias b2']
  ];

  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));

  function input(notes, key, label) {
    return `<input type="text" data-network-field="${key}" aria-label="${escape(label)}" value="${escape(notes[key])}" autocomplete="off" spellcheck="false" maxlength="120" placeholder="…">`;
  }

  function node(notes, key, symbol, formula, label, extra = '') {
    return `<div class="network-work-node network-work-${key}"><span class="network-work-symbol">${symbol}</span><span class="network-work-formula">${formula}</span><label class="network-work-entry"><span aria-hidden="true">=</span>${input(notes, key, label)}</label>${extra}</div>`;
  }

  function wire(className, paths) {
    // The arrow is drawn inside its grid gap, so it cannot cover an input.
    return `<svg class="network-work-wire ${className}" viewBox="0 0 24 280" preserveAspectRatio="none" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1.4" vector-effect="non-scaling-stroke">${paths.map(path => `<path d="${path}" vector-effect="non-scaling-stroke"/>`).join('')}</g></svg>`;
  }

  function render(notes = {}, { open = true, backwardOpen = false, savedLabel = 'Saved' } = {}) {
    const values = notes && typeof notes === 'object' ? notes : {};
    return `<details class="network-details context-panel network-work" data-network-panel${open ? ' open' : ''}>
      <summary><strong>Network reference</strong><span data-network-save role="status" aria-live="polite">${escape(savedLabel)}</span></summary>
      <div class="network-work-body">
        <table class="network-work-values">
          <caption>Given values</caption>
          <thead><tr><th colspan="2" scope="colgroup">Input</th><th colspan="2" scope="colgroup">Hidden 1</th><th colspan="2" scope="colgroup">Hidden 2</th><th colspan="2" scope="colgroup">Output</th></tr></thead>
          <tbody>
            <tr><th scope="row">x₁</th><td>1</td><th scope="row">w₁₁</th><td>2</td><th scope="row">w₂₁</th><td>−1</td><th scope="row">v₁</th><td>1</td></tr>
            <tr><th scope="row">x₂</th><td>2</td><th scope="row">w₁₂</th><td>−1</td><th scope="row">w₂₂</th><td>−1</td><th scope="row">v₂</th><td>3</td></tr>
            <tr><th scope="row">y</th><td>0</td><th scope="row">b₁</th><td>1</td><th scope="row">b₂</th><td>1</td><th scope="row">c</th><td>−1</td></tr>
          </tbody>
        </table>
        <div class="network-work-heading">Forward pass</div>
        <div class="network-work-forward" role="group" aria-label="Forward pass. Both inputs feed each hidden unit; both hidden activations feed the output.">
          <div class="network-work-input network-work-x1">x₁ = 1</div>
          <div class="network-work-input network-work-x2">x₂ = 2</div>
          ${wire('network-work-input-wires', ['M0 65 H22 M17 60 L22 65 L17 70', 'M0 215 H22 M17 210 L22 215 L17 220', 'M0 65 L22 215', 'M0 215 L22 65'])}
          ${node(values, 'z1', 'z₁', 'w₁₁x₁ + w₁₂x₂ + b₁', 'z1, hidden unit 1 pre-activation')}
          ${node(values, 'z2', 'z₂', 'w₂₁x₁ + w₂₂x₂ + b₂', 'z2, hidden unit 2 pre-activation')}
          ${wire('network-work-hidden-wires', ['M0 65 H22 M17 60 L22 65 L17 70', 'M0 215 H22 M17 210 L22 215 L17 220'])}
          ${node(values, 'h1', 'h₁', 'ReLU(z₁)', 'h1, hidden unit 1 ReLU activation')}
          ${node(values, 'h2', 'h₂', 'ReLU(z₂)', 'h2, hidden unit 2 ReLU activation')}
          ${wire('network-work-merge-wires', ['M0 65 L22 140 M16 134 L22 140 L16 144', 'M0 215 L22 140'])}
          ${node(values, 's', 's', 'v₁h₁ + v₂h₂ + c', 's, output logit')}
          ${wire('network-work-logit-wire', ['M0 140 H22 M17 135 L22 140 L17 145'])}
          ${node(values, 'p', 'p', 'σ(s)', 'p, sigmoid probability')}
          ${wire('network-work-loss-wire', ['M0 140 H22 M17 135 L22 140 L17 145'])}
          ${node(values, 'L', 'L', '−ln(1 − p)', 'L, binary cross-entropy loss', '<span class="network-work-target">y = 0</span>')}
        </div>
        <details class="network-work-backward" data-network-backward${backwardOpen ? ' open' : ''}>
          <summary>Backward pass</summary>
          <p class="network-work-shortcut">∂L/∂s = p − y</p>
          <div class="network-work-gradients">
            ${GRADIENTS.map(([key, symbol, label]) => `<label class="network-work-gradient"><span>∂L/∂${symbol}</span>${input(values, key, `Gradient of loss with respect to ${label}`)}</label>`).join('')}
          </div>
        </details>
      </div>
    </details>`;
  }

  const api = Object.freeze({ FIELD_KEYS, render });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.StudyNetwork = api;
})(typeof window !== 'undefined' ? window : null);
