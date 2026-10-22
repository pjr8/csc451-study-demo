(function (root) {
  'use strict';

  const EXAMPLE = Object.freeze({ x1: 2, x2: -1, y: 1, w11: 1, w12: -2, b1: -1, w21: -1, w22: 1, b2: 1, v1: 2, v2: -1, c: -6, eta: .1 });
  const PARAMETERS = Object.freeze(['w11', 'w12', 'b1', 'w21', 'w22', 'b2', 'v1', 'v2', 'c']);
  const SYMBOLS = Object.freeze({ x1: 'x₁', x2: 'x₂', w11: 'w₁₁', w12: 'w₁₂', b1: 'b₁', w21: 'w₂₁', w22: 'w₂₂', b2: 'b₂', v1: 'v₁', v2: 'v₂', c: 'c', z1: 'z₁', z2: 'z₂', h1: 'h₁', h2: 'h₂', s: 's', p: 'p', L: 'L' });
  const round4 = value => {
    if (!Number.isFinite(value)) return value;
    const rounded = Number(value.toFixed(4));
    return rounded === 0 ? 0 : rounded;
  };
  const formatNumber = value => {
    const rounded = round4(value);
    return (Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(4)).replace('-', '−');
  };
  const fmt = formatNumber;
  const term = value => `(${fmt(value)})`;
  const product = (a, b) => `${term(a)}${term(b)}`;

  function forward(p) {
    const z1 = p.w11 * p.x1 + p.w12 * p.x2 + p.b1;
    const z2 = p.w21 * p.x1 + p.w22 * p.x2 + p.b2;
    const h1 = Math.max(0, z1), h2 = Math.max(0, z2), s = p.v1 * h1 + p.v2 * h2 + p.c;
    // Branching sigmoid and softplus BCE remain stable even for large logits.
    const probability = s >= 0 ? 1 / (1 + Math.exp(-s)) : Math.exp(s) / (1 + Math.exp(s));
    const L = Math.max(s, 0) - p.y * s + Math.log1p(Math.exp(-Math.abs(s)));
    const result = { z1, z2, h1, h2, s, p: probability, L };
    if (!Object.values(result).every(Number.isFinite)) throw new RangeError('The network calculation is too large.');
    return result;
  }

  function compute(input = EXAMPLE) {
    const params = { ...EXAMPLE, ...input };
    for (const name of Object.keys(EXAMPLE)) if (typeof params[name] !== 'number' || !Number.isFinite(params[name])) throw new TypeError(`${name} must be finite.`);
    if (params.y !== 0 && params.y !== 1) throw new RangeError('The target y must be 0 or 1.');
    if (params.eta < 0) throw new RangeError('The learning rate cannot be negative.');
    const f = forward(params), ds = f.p - params.y;
    const dh1 = ds * params.v1, dh2 = ds * params.v2;
    // At zero, use the same derivative-zero convention as the original quiz.
    const dz1 = dh1 * (f.z1 > 0 ? 1 : 0), dz2 = dh2 * (f.z2 > 0 ? 1 : 0);
    const gradients = { ds, dv1: ds * f.h1, dv2: ds * f.h2, dc: ds, dh1, dh2, dz1, dz2,
      dw11: dz1 * params.x1, dw12: dz1 * params.x2, db1: dz1,
      dw21: dz2 * params.x1, dw22: dz2 * params.x2, db2: dz2 };
    const updated = { ...params };
    for (const name of PARAMETERS) updated[name] = params[name] - params.eta * gradients[`d${name}`];
    const inputGradients = { dx1: dz1 * params.w11 + dz2 * params.w21, dx2: dz1 * params.w12 + dz2 * params.w22 };
    if (![...Object.values(gradients), ...Object.values(updated), ...Object.values(inputGradients)].every(Number.isFinite)) throw new RangeError('The network calculation is too large.');
    return { params, forward: f, gradients, updated, after: forward(updated), inputGradients };
  }

  // These paths model arithmetic performed with the values visible on paper.
  // Keep them separate from compute(): its full-precision result is the reference.
  const roundedValues = values => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, round4(value)]));
  const probabilityFor = s => s >= 0 ? 1 / (1 + Math.exp(-s)) : Math.exp(s) / (1 + Math.exp(s));
  const lossFor = (probability, target) => target === 1 ? -Math.log(probability) : -Math.log1p(-probability);

  function roundedForward(params) {
    const z1 = round4(params.w11 * params.x1 + params.w12 * params.x2 + params.b1);
    const z2 = round4(params.w21 * params.x1 + params.w22 * params.x2 + params.b2);
    const h1 = round4(Math.max(0, z1)), h2 = round4(Math.max(0, z2));
    const s = round4(params.v1 * h1 + params.v2 * h2 + params.c);
    const p = round4(probabilityFor(s));
    return { z1, z2, h1, h2, s, p, L: round4(lossFor(p, params.y)) };
  }

  function roundedArithmetic(result, useCanonicalParents) {
    const params = roundedValues(result.params);
    let f = roundedForward(params);
    if (useCanonicalParents) {
      const source = roundedValues(result.forward);
      f = {
        z1: f.z1, z2: f.z2,
        h1: round4(Math.max(0, source.z1)), h2: round4(Math.max(0, source.z2)),
        s: round4(params.v1 * source.h1 + params.v2 * source.h2 + params.c),
        p: round4(probabilityFor(source.s)), L: round4(lossFor(source.p, params.y))
      };
    }
    const F = useCanonicalParents ? roundedValues(result.forward) : f;
    const canonicalGradients = roundedValues(result.gradients);
    const ds = round4(F.p - params.y);
    const sourceDs = useCanonicalParents ? canonicalGradients.ds : ds;
    const dh1 = round4(sourceDs * params.v1), dh2 = round4(sourceDs * params.v2);
    const sourceDh1 = useCanonicalParents ? canonicalGradients.dh1 : dh1;
    const sourceDh2 = useCanonicalParents ? canonicalGradients.dh2 : dh2;
    const dz1 = round4(sourceDh1 * (F.z1 > 0 ? 1 : 0));
    const dz2 = round4(sourceDh2 * (F.z2 > 0 ? 1 : 0));
    const sourceDz1 = useCanonicalParents ? canonicalGradients.dz1 : dz1;
    const sourceDz2 = useCanonicalParents ? canonicalGradients.dz2 : dz2;
    const gradients = {
      ds, dv1: round4(sourceDs * F.h1), dv2: round4(sourceDs * F.h2), dc: sourceDs,
      dh1, dh2, dz1, dz2,
      dw11: round4(sourceDz1 * params.x1), dw12: round4(sourceDz1 * params.x2), db1: sourceDz1,
      dw21: round4(sourceDz2 * params.x1), dw22: round4(sourceDz2 * params.x2), db2: sourceDz2
    };
    const sourceGradients = useCanonicalParents ? canonicalGradients : gradients;
    const updated = { ...params };
    for (const name of PARAMETERS) updated[name] = round4(params[name] - params.eta * sourceGradients[`d${name}`]);
    // The update table displays the canonical new parameters. A learner can
    // also start the second pass directly from that rounded table.
    const afterParams = useCanonicalParents ? roundedValues(result.updated) : updated;
    return { params, forward: f, gradients, updated, after: roundedForward(afterParams) };
  }

  function answerValues(result) {
    return {
      ...result.forward, ...result.gradients,
      neww11: result.updated.w11, neww12: result.updated.w12,
      newv1: result.updated.v1, newc: result.updated.c,
      afterz1: result.after.z1, afters: result.after.s,
      afterp: result.after.p, afterL: result.after.L
    };
  }

  function randomFor(seed) {
    if ((typeof seed !== 'string' && typeof seed !== 'number') || String(seed).length === 0 || (typeof seed === 'number' && !Number.isFinite(seed))) throw new TypeError('A nonempty string or finite numeric seed is required.');
    const text = String(seed);
    let value = 2166136261;
    for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
    return () => {
      value += 0x6D2B79F5;
      let next = Math.imul(value ^ value >>> 15, 1 | value);
      next ^= next + Math.imul(next ^ next >>> 7, 61 | next);
      return ((next ^ next >>> 14) >>> 0) / 4294967296;
    };
  }

  function generate(seed) {
    const random = randomFor(seed), pick = values => values[Math.floor(random() * values.length)];
    const integers = [-3, -2, -1, 1, 2, 3];
    for (let attempt = 0; attempt < 2000; attempt++) {
      const x1 = pick(integers), x2 = pick(integers);
      const w11 = pick(integers), w12 = pick(integers), w21 = pick(integers), w22 = pick(integers);
      // Construct the biases from independently drawn sums. This keeps the
      // arithmetic small while varying which ReLU gates pass the gradient.
      const profile = Math.floor(random() * 3);
      const z1 = pick([1, 2, 3]) * (profile === 2 ? -1 : 1);
      const z2 = pick([1, 2, 3]) * (profile === 1 ? -1 : 1);
      const b1 = z1 - w11 * x1 - w12 * x2, b2 = z2 - w21 * x1 - w22 * x2;
      const v1 = pick(integers), v2 = pick(integers);
      const score = pick([0, 0, 0, -1, 1]);
      const c = score - v1 * Math.max(0, z1) - v2 * Math.max(0, z2);
      if (Math.abs(b1) > 10 || Math.abs(b2) > 10 || Math.abs(c) > 12) continue;
      const params = { x1, x2, y: pick([0, 1]), w11, w12, b1, w21, w22, b2, v1, v2, c, eta: pick([.05, .1]) };
      const result = compute(params);
      // Avoid an oversized update or a second-pass ReLU boundary in a hand
      // exercise; never replace generation with a fixed example catalogue.
      if (result.after.L >= result.forward.L || Math.abs(result.after.z1) < .05 || Math.abs(result.after.z2) < .05) continue;
      return params;
    }
    throw new Error('Could not generate a suitable network for this seed.');
  }

  function buildLesson(input = EXAMPLE) {
    const result = compute(input), p = result.params, F = result.forward, G = result.gradients, A = result.after, U = result.updated;
    const field = (key, label, expected) => ({ key, label, expected });
    const gate = index => F[`z${index}`] > 0 ? 1 : 0;
    const state = index => gate(index) ? 'active' : 'inactive';
    const lossExpression = name => p.y === 1 ? `−ln(${name})` : `−ln(1 − ${name})`;
    const gateDescription = index => gate(index)
      ? `Unit ${index} has z${index === 1 ? '₁' : '₂'} = ${fmt(F[`z${index}`])} > 0, so its ReLU slope is 1 and its gradient passes through unchanged.`
      : `Unit ${index} has z${index === 1 ? '₁' : '₂'} = ${fmt(F[`z${index}`])}${F[`z${index}`] < 0 ? ' < 0' : ' (the boundary)'}, so its ReLU slope is 0${F[`z${index}`] === 0 ? ' by convention' : ''} and it blocks the gradient into its incoming weights.`;
    const sumWorking = (i, suffix = '', params = p, values = F) => `z${i === 1 ? '₁' : '₂'}${suffix} = ${product(params[`w${i}1`], params.x1)} + ${product(params[`w${i}2`], params.x2)} + ${term(params[`b${i}`])} = ${fmt(values[`z${i}`])}`;
    const outputWorking = (suffix = '', params = p, values = F) => `s${suffix} = ${product(params.v1, values.h1)} + ${product(params.v2, values.h2)} + ${term(params.c)} = ${fmt(values.s)}`;
    const activeCount = gate(1) + gate(2);
    const inactiveOutput = [1, 2].filter(i => !gate(i));
    const dLdp = p.y === 1 ? -1 / F.p : 1 / (1 - F.p);
    const dPds = F.p * (1 - F.p);
    const targetDirection = p.y === 1 ? 'increase toward 1' : 'decrease toward 0';
    const steps = [
      { title: 'Add weighted inputs', phase: 'Forward', short: 'Hidden sums', active: ['x1', 'x2', 'z1', 'z2'], fields: [field('z1', 'z₁', F.z1), field('z2', 'z₂', F.z2)],
        lead: 'Multiply each input by its connection weight. Add the bias last.',
        formula: 'z₁ = w₁₁x₁ + w₁₂x₂ + b₁\nz₂ = w₂₁x₁ + w₂₂x₂ + b₂',
        working: `${sumWorking(1)}\n${sumWorking(2)}`,
        why: '<p>A hidden unit first makes a weighted sum, called its <strong>pre-activation</strong> z. Both inputs connect to both hidden units. The bias shifts the sum; it is not multiplied by an input.</p><p>The first subscript identifies the hidden unit. For example, w₁₂ is the connection from x₂ into hidden unit 1.</p>',
        mistake: 'Keep negative signs inside parentheses: a negative times a negative is positive. Apply ReLU only after adding both weighted inputs and the bias.' },
      { title: 'Apply the ReLU gates', phase: 'Forward', short: 'ReLU', active: ['z1', 'z2', 'h1', 'h2'], fields: [field('h1', 'h₁', F.h1), field('h2', 'h₂', F.h2)],
        lead: 'Positive sums pass through. Negative sums become zero.',
        formula: 'hⱼ = ReLU(zⱼ) = max(0, zⱼ)',
        working: `h₁ = max(0, ${fmt(F.z1)}) = ${fmt(F.h1)}\nh₂ = max(0, ${fmt(F.z2)}) = ${fmt(F.h2)}`,
        why: `<p>ReLU keeps a positive input unchanged and replaces a negative input with zero. Hidden unit 1 is <strong>${state(1)}</strong>; hidden unit 2 is <strong>${state(2)}</strong> for this example.</p><p>Keep both original sums in your notes: z₁ = ${fmt(F.z1)}, z₂ = ${fmt(F.z2)}. Their signs determine the ReLU slopes during backpropagation.</p>`,
        mistake: 'z and h are different values. ReLU replaces a negative value with zero; it does not take its absolute value.' },
      { title: 'Calculate the output score', phase: 'Forward', short: 'Output score', active: ['h1', 'h2', 's'], fields: [field('s', 's', F.s)],
        lead: 'Combine the hidden activations using the output weights.',
        formula: 's = v₁h₁ + v₂h₂ + c', working: outputWorking(),
        why: `<p>The output score s is also called a <strong>logit</strong>. It can be any real number. It is not yet a probability.</p><p>${inactiveOutput.length ? `Hidden unit ${inactiveOutput.join(' and ')} contributes zero because its activation is zero, regardless of its output weight.` : 'Both hidden units contribute here because both activations are positive. Each contribution still takes the sign of its output weight.'}</p>`,
        mistake: 'Use h₁ and h₂, not z₁ and z₂. Do not apply another ReLU at the output; this network uses sigmoid.' },
      { title: 'Turn the score into loss', phase: 'Forward', short: 'Probability & loss', active: ['s', 'p', 'L'], fields: [field('p', 'p', F.p), field('L', 'L', F.L)],
        lead: 'Sigmoid gives a probability. Binary cross-entropy measures its error.',
        formula: 'p = σ(s) = 1 / (1 + e⁻ˢ)\nL = −[y ln(p) + (1 − y) ln(1 − p)]',
        working: `p = σ(${fmt(F.s)}) = 1 / (1 + exp(${fmt(-F.s)})) = ${fmt(F.p)}\ny = ${p.y} → L = ${lossExpression(fmt(F.p))} = ${fmt(F.L)}`,
        why: `<p>The target is <strong>y = ${p.y}</strong>, so we want p to ${targetDirection}. ${F.s === 0 ? 'A score of zero gives p = 0.5 and a loss of ln(2).' : 'You can use the exact sigmoid value or its displayed four-decimal value when computing the loss.'}</p><p>For y = 1, only −ln(p) remains. For y = 0, only −ln(1 − p) remains. Here use <strong>${lossExpression('p')}</strong>.</p>`,
        mistake: 'Use the natural logarithm ln, not log₁₀. You can leave an exact expression such as -ln(sigmoid(s)) or -ln(1-sigmoid(s)), with the branch matching y. Calculations using the displayed four-decimal values are accepted too.' },
      { title: 'Start backward at the loss', phase: 'Backward', short: 'Output error', active: ['L', 'p', 's'], fields: [field('ds', '∂L/∂s', G.ds)],
        lead: 'Combine the loss derivative and sigmoid derivative.',
        formula: '∂L/∂p = −y/p + (1 − y)/(1 − p)\n∂p/∂s = p(1 − p)\n∂L/∂s = (∂L/∂p)(∂p/∂s) = p − y',
        working: `∂L/∂p = ${p.y === 1 ? `−1 / ${fmt(F.p)}` : `1 / (1 − ${fmt(F.p)})`} = ${fmt(dLdp)}\n∂p/∂s = ${product(F.p, 1 - F.p)} = ${fmt(dPds)}\n∂L/∂s = ${fmt(F.p)} − ${p.y} = ${fmt(G.ds)}`,
        why: `<p>A derivative tells you how the loss changes when a value increases a tiny amount. The <strong>${G.ds < 0 ? 'negative' : 'positive'}</strong> ∂L/∂s means ${G.ds < 0 ? 'increasing' : 'decreasing'} s would reduce L here.</p><p>The chain rule multiplies the sensitivities along L ← p ← s. Algebraically, ∂L/∂p = (p − y)/[p(1 − p)]; multiplying by p(1 − p) leaves p − y.</p><p>This shortcut belongs to <strong>sigmoid + binary cross-entropy</strong>, not every activation and loss combination.</p>`,
        mistake: 'Do not multiply p − y by the sigmoid derivative again. That derivative is already included in the shortcut. y − p has the opposite sign.' },
      { title: 'Differentiate the output layer', phase: 'Backward', short: 'Output gradients', active: ['s', 'h1', 'h2'], fields: [field('dv1', '∂L/∂v₁', G.dv1), field('dv2', '∂L/∂v₂', G.dv2), field('dc', '∂L/∂c', G.dc)],
        lead: 'A weight gradient is the upstream gradient × its input activation.',
        formula: '∂L/∂v₁ = (∂L/∂s)h₁\n∂L/∂v₂ = (∂L/∂s)h₂\n∂L/∂c = ∂L/∂s',
        working: `∂L/∂v₁ = ${product(G.ds, F.h1)} = ${fmt(G.dv1)}\n∂L/∂v₂ = ${product(G.ds, F.h2)} = ${fmt(G.dv2)}\n∂L/∂c = ${fmt(G.dc)}`,
        why: `<p>In s = v₁h₁ + v₂h₂ + c, the local derivatives with respect to v₁, v₂ and c are h₁, h₂ and 1. Multiply each by the arriving gradient, ∂L/∂s.</p><p>The bias has an implicit input of 1. ${inactiveOutput.length ? `The gradient for v${inactiveOutput[0] === 1 ? '₁' : '₂'} is zero because its input activation is zero.` : 'Both output-weight gradients are nonzero here because both hidden activations are positive.'}</p>`,
        mistake: 'For a weight gradient, multiply by the activation feeding that weight, not by the weight itself. The old weight is used when sending a gradient to the previous layer.' },
      { title: 'Send error through the gates', phase: 'Backward', short: 'Hidden gradients', active: ['s', 'h1', 'h2', 'z1', 'z2'], fields: [field('dh1', '∂L/∂h₁', G.dh1), field('dh2', '∂L/∂h₂', G.dh2), field('dz1', '∂L/∂z₁', G.dz1), field('dz2', '∂L/∂z₂', G.dz2)],
        lead: 'Multiply by the old output weight, then by the ReLU derivative.',
        formula: '∂L/∂hⱼ = (∂L/∂s)vⱼ\n∂L/∂zⱼ = (∂L/∂hⱼ) ReLU′(zⱼ)\nReLU′(z) = 1 if z > 0; 0 if z < 0',
        working: `∂L/∂h₁ = ${product(G.ds, p.v1)} = ${fmt(G.dh1)} → ∂L/∂z₁ = ${product(G.dh1, gate(1))} = ${fmt(G.dz1)}\n∂L/∂h₂ = ${product(G.ds, p.v2)} = ${fmt(G.dh2)} → ∂L/∂z₂ = ${product(G.dh2, gate(2))} = ${fmt(G.dz2)}`,
        why: `<p>${gateDescription(1)}</p><p>${gateDescription(2)}</p><p>The gradient arriving at hⱼ can be nonzero even when the gradient reaching zⱼ is blocked. At exactly z = 0, ReLU is not differentiable; the lesson and quiz use slope 0 by convention.</p>`,
        mistake: 'Save both ∂L/∂hⱼ and ∂L/∂zⱼ. The ReLU gate depends on the forward-pass z, not the sign of the arriving gradient.' },
      { title: 'Differentiate the hidden weights', phase: 'Backward', short: 'Hidden weights', active: ['z1', 'z2', 'x1', 'x2'], fields: [field('dw11', '∂L/∂w₁₁', G.dw11), field('dw12', '∂L/∂w₁₂', G.dw12), field('db1', '∂L/∂b₁', G.db1), field('dw21', '∂L/∂w₂₁', G.dw21), field('dw22', '∂L/∂w₂₂', G.dw22), field('db2', '∂L/∂b₂', G.db2)],
        lead: 'Use the same weight rule: upstream gradient × input.',
        formula: '∂L/∂wⱼᵢ = (∂L/∂zⱼ)xᵢ\n∂L/∂bⱼ = ∂L/∂zⱼ',
        working: [1, 2].map(i => `∂L/∂w${i === 1 ? '₁₁' : '₂₁'} = ${product(G[`dz${i}`], p.x1)} = ${fmt(G[`dw${i}1`])}\n∂L/∂w${i === 1 ? '₁₂' : '₂₂'} = ${product(G[`dz${i}`], p.x2)} = ${fmt(G[`dw${i}2`])}\n∂L/∂b${i === 1 ? '₁' : '₂'} = ${fmt(G[`db${i}`])}`).join('\n'),
        why: `<p>The inputs are x₁ = ${fmt(p.x1)} and x₂ = ${fmt(p.x2)}. A negative input reverses the upstream gradient's sign; a positive input preserves it.</p><p>${activeCount === 2 ? 'Both hidden units are active, so both sets of incoming parameters can receive nonzero gradients.' : `All three parameters feeding inactive unit ${inactiveOutput[0]} receive zero gradient on this example because its ∂L/∂z is zero. A different input can activate that unit.`}</p>`,
        mistake: 'Use x₁ for w₁₁ and w₂₁; use x₂ for w₁₂ and w₂₂. A bias gradient is the upstream gradient without an extra input factor.' },
      { title: 'Update every parameter together', phase: 'Update', short: 'Gradient descent', active: ['x1', 'x2', 'z1', 'z2', 'h1', 'h2', 's'], fields: [field('neww11', 'new w₁₁', U.w11), field('neww12', 'new w₁₂', U.w12), field('newv1', 'new v₁', U.v1), field('newc', 'new c', U.c)],
        lead: `Subtract learning rate × gradient. Here η = ${fmt(p.eta)}.`, formula: 'θnew = θold − η(∂L/∂θ)',
        working: ['w11', 'w12', 'v1', 'c'].map(name => `${SYMBOLS[name]},new = ${fmt(p[name])} − ${product(p.eta, G[`d${name}`])} = ${fmt(U[name])}`).join('\n'),
        why: '<p>A negative gradient makes the parameter increase; a positive gradient makes it decrease. A zero gradient leaves it unchanged. Gradient descent subtracts the gradient.</p><p>Compute <strong>every gradient with the original parameters</strong>. Only then update all nine parameters together. Inputs, target and learning rate are not trained parameters.</p><p>The four answer fields sample the updates. The complete nine-parameter update table appears after checking or revealing this step.</p>',
        mistake: 'Do not update v₁ early and then use the new v₁ to calculate ∂L/∂h₁. That mixes two different networks in one backward pass.' },
      { title: 'Run forward once more', phase: 'Check', short: 'Check the update', active: ['x1', 'x2', 'z1', 'z2', 'h1', 'h2', 's', 'p', 'L'], fields: [field('afterz1', 'new z₁', A.z1), field('afters', 'new s', A.s), field('afterp', 'new p', A.p), field('afterL', 'new L', A.L)],
        lead: 'Use the new weights and the same input to check what changed.', formula: 'New parameters → new forward pass → compare loss',
        working: `${sumWorking(1, ',new', U, A)}\n${sumWorking(2, ',new', U, A)}\nh₁,new = ${fmt(A.h1)}, h₂,new = ${fmt(A.h2)}\n${outputWorking(',new', U, A)}\npnew = σ(${fmt(A.s)}) = ${fmt(A.p)}\nLnew = ${lossExpression('pnew')} = ${fmt(A.L)}`,
        why: `<p>The loss ${A.L < F.L ? 'fell' : A.L > F.L ? 'rose' : 'stayed unchanged'} from ${fmt(F.L)} to ${fmt(A.L)}. The target is y = ${p.y}, so the desired probability direction is to ${targetDirection}.</p><p>A sufficiently small step usually reduces a differentiable loss locally. A large learning rate can overshoot; lower loss is not guaranteed for every step size.</p><p>Use exact expressions or work with the displayed four-decimal values. For this pass, enter <code>sigmoid(${fmt(A.s).replace('−', '-')})</code> for p, and <code>${p.y === 1 ? '-ln(sigmoid(' : '-ln(1-sigmoid('}${fmt(A.s).replace('−', '-')}${p.y === 1 ? '))' : '))'}</code> for loss. Decimal approximations are optional.</p>`,
        mistake: `Loss and prediction are different quantities. For y = ${p.y}, a ${p.y === 1 ? 'higher' : 'lower'} probability is desirable. Recompute both ReLUs using the new sums; an update can change whether a gate is active.` }
    ];
    const fields = Object.fromEntries(steps.flatMap((step, owner) => step.fields.map(f => [f.key, { ...f, owner }])));
    const rounding = { sequential: roundedArithmetic(result, false), display: roundedArithmetic(result, true) };
    const shownAfter = roundedValues(A), shownUpdated = roundedValues(U);
    // A student may also use a value from the displayed second-pass reference
    // directly, instead of carrying the independently rounded pass forward.
    const afterParents = {
      afterz1: rounding.display.after.z1,
      afters: round4(shownUpdated.v1 * shownAfter.h1 + shownUpdated.v2 * shownAfter.h2 + shownUpdated.c),
      afterp: round4(probabilityFor(shownAfter.s)),
      afterL: round4(lossFor(shownAfter.p, p.y))
    };
    const values = [answerValues(result), answerValues(rounding.sequential), answerValues(rounding.display), afterParents];
    const answerVariants = Object.fromEntries(Object.keys(fields).map(key => [key,
      [...new Set(values.map(candidate => candidate[key]).filter(Number.isFinite))]
    ]));
    const context = values => ({ p: values.p, s: values.s, y: p.y });
    const contexts = {
      exact: context(F), rounded: context(rounding.sequential.forward), display: context(roundedValues(F)),
      afterExact: context(A), afterRounded: context(rounding.sequential.after), afterDisplay: context(rounding.display.after),
      afterReference: context(shownAfter)
    };
    return { params: p, result, steps, fields, answerVariants, contexts, rounding };
  }

  const api = Object.freeze({ EXAMPLE, PARAMETERS, SYMBOLS, round4, formatNumber, compute, generate, buildLesson });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.StudyBackpropEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
