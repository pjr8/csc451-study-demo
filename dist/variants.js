(function (root) {
  'use strict';

  // All inputs are small integers. Fractions stay exact in displayed answers.
  const gcd = (a, b) => b ? gcd(b, a % b) : Math.abs(a);
  function fraction(n, d = 1) {
    if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) throw new Error('Invalid fraction');
    if (d < 0) { n = -n; d = -d; }
    const g = gcd(n, d) || 1;
    n /= g; d /= g;
    return { value: n / d, text: d === 1 ? String(n) : `${n}/${d}` };
  }
  const scalar = (n, explanation, d = 1) => ({ ...fraction(n, d), explanation });
  const label = (value, explanation, text = value) => ({ value, text, explanation });
  const sum = a => a.reduce((s, v) => s + v, 0);
  const dot = (a, b) => sum(a.map((v, i) => v * b[i]));
  const vector = a => `[${a.join(', ')}]`;
  const times = (a, b) => `${a} × (${b})`;
  const sign = n => n < 0 ? `− ${Math.abs(n)}` : `+ ${n}`;
  const shape = (a, b) => `${a} × ${b}`;
  function rngFrom(seed) {
    const s = String(seed);
    let a = 2166136261;
    for (let i = 0; i < s.length; i++) a = Math.imul(a ^ s.charCodeAt(i), 16777619);
    return function () {
      a += 0x6D2B79F5;
      let t = a;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function shuffled(a, random) {
    const b = a.slice();
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
  }

  const factories = {
    weighted(r) {
      const w = [r.nz(-3, 3), r.nz(-3, 3), r.nz(-3, 3)];
      const x = [r.int(1, 4), r.int(1, 4), r.int(1, 4)], b = r.nz(-3, 3);
      const products = w.map((v, i) => v * x[i]), s = sum(products), result = s + b;
      const solution = `${w.map((v, i) => times(v, x[i])).join(' + ')} + (${b}) = ${s} + (${b}) = ${result}.`;
      return {
        topic: 'Linear neurons', skillKey: 'linear-weighted-sum',
        prompt: `w = ${vector(w)}, x = ${vector(x)}, b = ${b}. What is z = w · x + b?`,
        calculation: { kind: 'weighted', params: { w, x, b } },
        answer: scalar(result, solution),
        distractors: [
          scalar(s, `The dot product is ${s}, but this omits the bias ${b}.`),
          scalar(s - b, `This subtracts the bias: ${s} − (${b}) = ${s - b}. The formula adds it.`),
          scalar(s + 2 * b, `This adds the bias twice: ${s} + 2 × (${b}) = ${s + 2 * b}. Add it once.`),
          scalar(sum(w) + sum(x) + b, `Adding vector entries gives ${sum(w) + sum(x) + b}. A dot product multiplies each corresponding pair first.`),
          scalar(sum(products.map(Math.abs)) + b, `Taking absolute values of the products gives this result. Preserve their signs: the dot product is ${s}.`)
        ],
        recall: { prompt: 'Calculate z. Show the three products and include the bias.', answer: solution, checklist: ['Multiply corresponding entries.', 'Add the three products.', `Add the bias ${b} once.`] }
      };
    },
    relu(r) {
      const a = r.int(1, 9), b = r.int(1, 9), answer = `0,${b}`;
      return {
        topic: 'Activation functions', skillKey: 'relu-output',
        prompt: `ReLU(z) = max(0, z). What are ReLU(−${a}) and ReLU(${b}), in that order?`,
        calculation: { kind: 'relu', params: { a, b } },
        answer: label(answer, `The negative input becomes 0; the positive input stays ${b}.`, `(0, ${b})`),
        distractors: [
          label(`${-a},${b}`, `This leaves −${a} unchanged. ReLU replaces every negative input with 0.`, `(−${a}, ${b})`),
          label(`${a},${b}`, `This takes the absolute value of −${a}. ReLU clips it to 0 instead.`, `(${a}, ${b})`),
          label('0,0', `Only the negative input becomes 0. The positive input ${b} passes through unchanged.`, '(0, 0)')
        ],
        recall: { prompt: 'Evaluate both ReLU outputs and state which input is clipped.', answer: `(0, ${b}). ReLU clips −${a} to 0 and preserves ${b}.`, checklist: ['Clip the negative input to 0.', 'Preserve the positive input.', 'Keep the requested order.'] }
      };
    },
    parameters(r) {
      const input = r.int(2, 5), hidden = r.int(2, 6), output = r.int(1, 3);
      const weights = input * hidden + hidden * output, total = weights + hidden + output;
      const solution = `(${input} × ${hidden} + ${hidden}) + (${hidden} × ${output} + ${output}) = ${total}: ${weights} weights and ${hidden + output} biases.`;
      return {
        topic: 'Network parameters', skillKey: 'parameter-count',
        prompt: `A fully connected network has layer sizes ${input} → ${hidden} → ${output}. Include one bias per neuron in each non-input layer. How many learnable parameters are there?`,
        calculation: { kind: 'parameters', params: { input, hidden, output } },
        answer: scalar(total, solution),
        distractors: [
          scalar(weights, `This counts only ${weights} weights and omits ${hidden + output} biases.`),
          scalar(input * hidden + hidden, `This counts only the first layer. The output layer adds ${hidden * output + output} parameters.`),
          scalar(total + input, `This incorrectly gives the ${input} input features their own biases. Only the hidden and output neurons have biases.`),
          scalar(weights + 2, `This adds one bias per layer. Each output neuron of each layer needs its own bias: ${hidden + output} biases.`)
        ],
        recall: { prompt: 'Count the weights and biases in each layer, then total them.', answer: solution, checklist: [`First layer: ${input * hidden} weights + ${hidden} biases.`, `Second layer: ${hidden * output} weights + ${output} biases.`, `Total: ${total}.`] }
      };
    },
    mse(r) {
      const target = [r.int(1, 5), r.int(1, 5), r.int(1, 5)];
      const errors = [r.int(1, 3), -r.int(1, 3), r.int(1, 3)];
      const predictions = target.map((v, i) => v + errors[i]), s = sum(errors.map(v => v * v));
      const solution = `Errors are ${vector(errors)}. MSE = (${errors.map(v => `(${v})²`).join(' + ')}) / 3 = ${fraction(s, 3).text}.`;
      return {
        topic: 'Loss functions', skillKey: 'mean-squared-error',
        prompt: `Predictions are ${vector(predictions)} and targets are ${vector(target)}. What is MSE = mean((prediction − target)²)?`,
        calculation: { kind: 'mse', params: { predictions, target } },
        answer: scalar(s, solution, 3),
        distractors: [
          scalar(s, `This is the sum of squared errors, ${s}. MSE divides that sum by 3 examples.`),
          scalar(sum(errors.map(Math.abs)), `This averages absolute errors. MSE squares them before averaging.`, 3),
          scalar(sum(errors), `This averages signed errors without squaring them. MSE averages their squares.`, 3),
          scalar(s, `This adds an extra factor of ½. The stated MSE definition is ${s}/3, with no factor of ½.`, 6)
        ],
        recall: { prompt: 'Calculate the three errors, square them, and average.', answer: solution, checklist: ['Subtract target from prediction for each example.', `Sum the squared errors: ${s}.`, 'Divide by the three examples; do not add a factor of ½.'] }
      };
    },
    matmul(r) {
      const [rows, inner, cols] = shuffled([2, 3, 4, 5, 6], r.random).slice(0, 3), result = shape(rows, cols);
      return {
        topic: 'Tensor shapes', skillKey: 'matrix-product-shape',
        prompt: `A has shape (${rows}, ${inner}) and B has shape (${inner}, ${cols}). What is the shape of A @ B?`,
        calculation: { kind: 'matmul', params: { rows, inner, cols } },
        answer: label(result, `The inner dimensions ${inner} match. Keep A's ${rows} rows and B's ${cols} columns: (${rows}, ${cols}).`),
        distractors: [
          label(shape(cols, rows), `This reverses the output dimensions. A @ B has A's ${rows} rows first and B's ${cols} columns second.`),
          label(shape(inner, inner), `The matching inner dimension ${inner} is contracted; it is not the output shape.`),
          label('Not defined', `The multiplication is defined because A's ${inner} columns match B's ${inner} rows.`)
        ],
        recall: { prompt: 'Check the inner dimensions and give the output shape.', answer: `(${rows}, ${inner}) @ (${inner}, ${cols}) → (${rows}, ${cols}).`, checklist: [`Inner dimensions: ${inner} = ${inner}.`, `Keep the outer dimensions: ${rows} rows and ${cols} columns.`] }
      };
    },
    incompatible(r) {
      const [rows, inner, other, cols] = shuffled([2, 3, 4, 5, 6], r.random).slice(0, 4);
      return {
        topic: 'Tensor shapes', skillKey: 'matrix-product-compatibility',
        prompt: `A has shape (${rows}, ${inner}) and B has shape (${other}, ${cols}). What happens when A @ B is evaluated?`,
        calculation: { kind: 'incompatible', params: { rows, inner, other, cols } },
        answer: label('Not defined', `Matrix multiplication requires A's columns to equal B's rows. Here ${inner} ≠ ${other}, so the operation raises a shape error.`),
        distractors: [
          label(shape(rows, cols), `These would be the outer dimensions, but the product cannot be formed: ${inner} ≠ ${other}.`),
          label(shape(inner, other), `These are the unequal inner dimensions. A @ B fails rather than returning this shape.`),
          label(shape(cols, rows), `Reversing the outer dimensions does not fix the mismatch: ${inner} ≠ ${other}.`)
        ],
        recall: { prompt: 'Decide whether the product is valid and state the required equality.', answer: `Not defined: A has ${inner} columns, but B has ${other} rows.`, checklist: ['Compare A columns with B rows.', `${inner} ≠ ${other}; report a shape error.`] }
      };
    },
    dot(r) {
      const a = [r.int(1, 4), -r.int(1, 4), r.int(1, 4)], b = [r.int(1, 4), r.int(1, 4), -r.int(1, 4)];
      const products = a.map((v, i) => v * b[i]), result = sum(products);
      const solution = `${a.map((v, i) => times(v, b[i])).join(' + ')} = ${result}.`;
      return {
        topic: 'Vector operations', skillKey: 'vector-dot-product',
        prompt: `a = ${vector(a)} and b = ${vector(b)}. What is a · b?`,
        calculation: { kind: 'dot', params: { a, b } },
        answer: scalar(result, solution),
        distractors: [
          scalar(sum(products.map(Math.abs)), `This ignores the negative products. The signed products are ${vector(products)}.`),
          scalar(products[0] + products[1], `This omits the third product, ${products[2]}. Include all three pairs.`),
          scalar(sum(a) * sum(b), `This multiplies the vector sums. A dot product sums only corresponding products.`),
          scalar(sum(a) + sum(b), `This adds all vector entries without multiplying corresponding entries first.`),
          scalar(products[0], `This is only the first product, ${a[0]} × ${b[0]}. Sum all three products.`)
        ],
        recall: { prompt: 'Compute the dot product. Show each signed product.', answer: solution, checklist: ['Multiply matching coordinates.', `Keep signs: ${vector(products)}.`, `Add the products: ${result}.`] }
      };
    },
    indexing(r) {
      const start = r.int(-6, 3), step = r.int(1, 3), data = Array.from({ length: 3 }, (_, row) => Array.from({ length: 3 }, (_, col) => start + step * (row * 3 + col)));
      const row = r.int(0, 2), col = r.int(0, 2), result = data[row][col];
      const alternatives = shuffled(Array.from({ length: 9 }, (_, i) => [Math.floor(i / 3), i % 3]).filter(([a, b]) => a !== row || b !== col), r.random).slice(0, 3);
      return {
        topic: 'Tensor indexing', skillKey: 'tensor-indexing',
        prompt: `What scalar does t[${row}, ${col}].item() return? Indices are zero-based.`,
        code: `t = torch.tensor(${JSON.stringify(data)})`,
        calculation: { kind: 'indexing', params: { data, row, col } },
        answer: scalar(result, `Index ${row} selects row ${row + 1}; index ${col} selects column ${col + 1}. That entry is ${result}.`),
        distractors: alternatives.map(([a, b]) => scalar(data[a][b], `This is t[${a}, ${b}], not t[${row}, ${col}]. Select the requested zero-based row and column.`)),
        recall: { prompt: 'Locate the requested row and column, then give the scalar.', answer: `t[${row}, ${col}] = ${result}.`, checklist: [`Row ${row} means the ${row + 1}${row === 0 ? 'st' : row === 1 ? 'nd' : 'rd'} row.`, `Column ${col} means the ${col + 1}${col === 0 ? 'st' : col === 1 ? 'nd' : 'rd'} column.`, `Read ${result}.`] }
      };
    },
    tensorSum(r) {
      const data = [Array.from({ length: 3 }, () => r.int(1, 5)), Array.from({ length: 3 }, () => r.int(1, 5))];
      const cols = data[0].map((v, i) => v + data[1][i]), rows = data.map(sum), total = sum(rows);
      const result = vector(cols);
      return {
        topic: 'Tensor reductions', skillKey: 'tensor-sum-dimension',
        prompt: 'What does t.sum(dim=0).tolist() return?',
        code: `t = torch.tensor(${JSON.stringify(data)})`,
        calculation: { kind: 'tensorSum', params: { data } },
        answer: label(result, `dim=0 removes the row dimension by adding down each column: ${data[0].map((v, i) => `${v} + ${data[1][i]} = ${cols[i]}`).join('; ')}.`),
        distractors: [
          label(vector(rows), `These are row sums from dim=1. dim=0 adds down the two rows and returns three column sums.`),
          label(String(total), `This sums every entry into one scalar. dim=0 keeps a separate sum for each of the three columns.`),
          label(vector(data[0]), `This is only the first row. Add the corresponding entries in the second row as well.`)
        ],
        recall: { prompt: 'Sum over dim=0 and show the remaining shape.', answer: `${result}, shape (3,). Each column is summed across the two rows.`, checklist: ['Remove dimension 0 (rows).', 'Add the two entries in each column.', 'Return a vector with three entries.'] }
      };
    },
    descent(r) {
      const weight = r.int(-6, 6), gradient = r.nz(-6, 6), divisor = r.int(2, 4);
      const result = fraction(weight * divisor - gradient, divisor);
      const solution = `w_new = ${weight} − (1/${divisor}) × (${gradient}) = ${result.text}.`;
      return {
        topic: 'Gradient descent', skillKey: 'gradient-descent-update',
        prompt: `w = ${weight}, ∂L/∂w = ${gradient}, and learning rate η = 1/${divisor}. After one gradient descent step, what is w?`,
        calculation: { kind: 'descent', params: { weight, gradient, divisor } },
        answer: scalar(weight * divisor - gradient, solution, divisor),
        distractors: [
          scalar(weight * divisor + gradient, `This adds η times the gradient. Gradient descent subtracts it.`, divisor),
          scalar(weight - gradient, `This subtracts the full gradient and ignores the learning rate 1/${divisor}.`),
          scalar(weight * divisor - 1, `This subtracts only the learning rate. Multiply it by the gradient ${gradient} first.`, divisor),
          scalar(-gradient, `This is only the change −η∂L/∂w = ${fraction(-gradient, divisor).text}. Add it to the old weight ${weight} to get the updated weight.`, divisor),
          scalar(weight * divisor - gradient * divisor * divisor, `This scales the gradient by ${divisor}, the reciprocal of η. The stated learning rate is 1/${divisor}.`, divisor)
        ],
        recall: { prompt: 'Write the gradient descent update and calculate the new weight.', answer: solution, checklist: ['Use w_new = w − η ∂L/∂w.', 'Scale the signed gradient by the learning rate.', `New weight: ${result.text}.`] }
      };
    },
    partial(r) {
      const a = r.int(1, 3), b = r.nz(-3, 3), c = r.int(1, 3), x = r.int(1, 3), y = r.int(1, 3), variable = r.int(0, 1) ? 'x' : 'y';
      const own = variable === 'x' ? 2 * a * x : 2 * c * y, cross = variable === 'x' ? b * y : b * x;
      const formula = variable === 'x' ? `${2 * a}x ${sign(b)}y` : `${b}x + ${2 * c}y`;
      const result = own + cross, other = variable === 'x' ? b * x + 2 * c * y : 2 * a * x + b * y;
      const solution = `Treat ${variable === 'x' ? 'y' : 'x'} as constant. ∂f/∂${variable} = ${formula}; at (${x}, ${y}), this is ${own} + (${cross}) = ${result}.`;
      return {
        topic: 'Partial derivatives', skillKey: 'partial-derivative',
        prompt: `f(x, y) = ${a}x² ${sign(b)}xy + ${c}y². What is ∂f/∂${variable} at x = ${x}, y = ${y}?`,
        calculation: { kind: 'partial', params: { a, b, c, x, y, variable } },
        answer: scalar(result, solution),
        distractors: [
          scalar(own, `This differentiates the squared term but omits the cross term's derivative, ${cross}.`),
          scalar(own / 2 + cross, `This misses the factor of 2 when differentiating the squared term.`),
          scalar(other, `This is the derivative with respect to ${variable === 'x' ? 'y' : 'x'}, the other variable.`),
          scalar(own + cross + (variable === 'x' ? c * y * y : a * x * x), `The term involving only ${variable === 'x' ? 'y' : 'x'} is constant for this derivative, so its derivative is 0.`),
          scalar(own - cross, `This reverses the sign of the cross term's derivative. Its signed contribution is ${cross}.`)
        ],
        recall: { prompt: `Differentiate with respect to ${variable}, then substitute the given x and y.`, answer: solution, checklist: [`Hold ${variable === 'x' ? 'y' : 'x'} constant.`, 'Apply the power rule and include the cross term.', 'Substitute the point after differentiating.'] }
      };
    },
    backprop(r) {
      const x = r.int(2, 4), w = r.nz(-3, 3), z = r.nz(-5, 5), b = z - w * x, v = r.pick([-3, -2, -1, 2, 3]), c = r.int(-2, 2);
      const h = Math.max(0, z), prediction = v * h + c, delta = r.nz(-3, 3), y = prediction - delta, gate = z > 0 ? 1 : 0;
      const variable = r.pick(['w', 'v', 'b']);
      const result = variable === 'v' ? delta * h : delta * v * gate * (variable === 'w' ? x : 1);
      const rule = variable === 'v' ? `(ŷ − y)h = (${delta}) × ${h}` : variable === 'w' ? `(ŷ − y)v ReLU′(z)x = (${delta}) × (${v}) × ${gate} × ${x}` : `(ŷ − y)v ReLU′(z) = (${delta}) × (${v}) × ${gate}`;
      const solution = `z = ${z}, h = ${h}, ŷ = ${prediction}, and ŷ − y = ${delta}. ∂L/∂${variable} = ${rule} = ${result}.`;
      const distractors = variable === 'v' ? [
        scalar(delta, `This is ∂L/∂ŷ = ${delta}. The gradient for v also multiplies by h = ${h}.`),
        scalar(delta * v, `This multiplies by v. The local derivative ∂ŷ/∂v is h = ${h}, not v.`),
        scalar(delta * z, `This uses preactivation z = ${z}. The output weight multiplies h = ReLU(z) = ${h}.`),
        scalar(delta * v * x, `This uses factors from the path to input weight w. For v, use only (ŷ − y)h.`),
        scalar(-result, `This negates the loss gradient. A negative gradient is used in an update, not in ∂L/∂v itself.`)
      ] : [
        scalar(delta, `This stops at the output derivative ∂L/∂ŷ = ${delta}. Continue the chain to ${variable}.`),
        scalar(delta * v * (variable === 'w' ? x : 1), `This ignores the ReLU gate. Here z = ${z}, so ReLU′(z) = ${gate}.`),
        scalar(delta * v * gate * (variable === 'w' ? 1 : x), variable === 'w' ? `This omits ∂z/∂w = x = ${x}.` : `This includes x = ${x}, but ∂z/∂b = 1.`),
        scalar(delta * x, variable === 'w' ? `This uses (ŷ − y)x but omits the output weight v = ${v}${gate ? '' : ' and the zero ReLU gate'}. Use the whole chain.` : `This uses (ŷ − y)x. The bias derivative instead multiplies by v = ${v} and the ReLU gate ${gate}; ∂z/∂b is 1.`),
        scalar(delta * v, `This is the upstream hidden-activation gradient. ${variable === 'w' ? `Continue through the ReLU gate and multiply by x = ${x}.` : `Continue through the ReLU gate, which is ${gate}.`}`),
        scalar(-result, `This reverses the gradient's sign. Report the derivative itself before any gradient descent update.`)
      ];
      return {
        topic: 'Backpropagation', skillKey: 'backprop-chain-rule',
        prompt: `x = ${x}, w = ${w}, b = ${b}, v = ${v}, c = ${c}, y = ${y}. The network is z = wx + b, h = ReLU(z), ŷ = vh + c, L = ½(ŷ − y)². What is ∂L/∂${variable}?`,
        calculation: { kind: 'backprop', params: { x, w, b, v, c, y, variable } },
        answer: scalar(result, solution), distractors,
        recall: { prompt: `Run the forward pass, then use the chain rule to find ∂L/∂${variable}.`, answer: solution, checklist: [`Forward pass: z = ${z}, h = ${h}, ŷ = ${prediction}.`, `Output derivative: ŷ − y = ${delta}.`, variable === 'v' ? `Multiply by h = ${h}.` : `Use ReLU′(${z}) = ${gate}${variable === 'w' ? ` and ∂z/∂w = x = ${x}` : ' and ∂z/∂b = 1'}.`, `Gradient: ${result}.`] }
      };
    }
  };

  ['accuracy', 'precision', 'recall'].forEach(kind => {
    factories[kind] = r => {
      const tp = r.int(2, 10), fn = r.int(1, 8), fp = r.int(1, 8), tn = r.int(5, 20);
      if (fn === fp) return null;
      const total = tp + fn + fp + tn;
      const formulas = {
        accuracy: [tp + tn, total, `(TP + TN) / total = (${tp} + ${tn}) / ${total}`],
        precision: [tp, tp + fp, `TP / (TP + FP) = ${tp} / (${tp} + ${fp})`],
        recall: [tp, tp + fn, `TP / (TP + FN) = ${tp} / (${tp} + ${fn})`]
      };
      const [n, d, formula] = formulas[kind], result = fraction(n, d);
      const alternatives = Object.keys(formulas).filter(k => k !== kind).map(k => {
        const [an, ad, af] = formulas[k];
        return scalar(an, `This is ${k}: ${af}. The question asks for ${kind}.`, ad);
      });
      alternatives.push(
        scalar(fp + fn, `This is the error rate: (FP + FN) / total = ${fp + fn}/${total}.`, total),
        scalar(tn, `This is specificity: TN / (TN + FP) = ${tn}/${tn + fp}.`, tn + fp),
        scalar(tp, `This divides TP by all ${total} examples. For ${kind}, use ${formula}.`, total)
      );
      return {
        topic: 'Classification metrics', skillKey: `confusion-${kind}`,
        prompt: `For this binary classifier, what is ${kind}? Give an exact fraction.`,
        context: 'confusion', matrix: { tp, fn, fp, tn },
        calculation: { kind, params: { tp, fn, fp, tn } },
        answer: scalar(n, `${formula} = ${result.text}.`, d), distractors: alternatives,
        recall: { prompt: `Write the formula for ${kind}, then substitute the confusion-matrix counts.`, answer: `${formula} = ${result.text}.`, checklist: [kind === 'accuracy' ? 'Count TP + TN as correct predictions.' : kind === 'precision' ? 'Use predicted positives: TP + FP.' : 'Use actual positives: TP + FN.', `Numerator ${n}; denominator ${d}.`, `Simplify to ${result.text}.`] }
      };
    };
  });

  // Recompute from the problem inputs, never from a cached answer or explanation.
  function expected(calculation) {
    if (!calculation || !calculation.params) return undefined;
    const p = calculation.params;
    switch (calculation.kind) {
      case 'weighted': return dot(p.w, p.x) + p.b;
      case 'relu': return `0,${p.b}`;
      case 'parameters': return p.input * p.hidden + p.hidden + p.hidden * p.output + p.output;
      case 'mse': return sum(p.predictions.map((v, i) => (v - p.target[i]) ** 2)) / p.target.length;
      case 'matmul': return shape(p.rows, p.cols);
      case 'incompatible': return p.inner !== p.other ? 'Not defined' : undefined;
      case 'dot': return dot(p.a, p.b);
      case 'indexing': return p.data[p.row][p.col];
      case 'tensorSum': return vector(p.data[0].map((_, c) => sum(p.data.map(row => row[c]))));
      case 'descent': return p.weight - p.gradient / p.divisor;
      case 'partial': return p.variable === 'x' ? 2 * p.a * p.x + p.b * p.y : p.b * p.x + 2 * p.c * p.y;
      case 'accuracy': return (p.tp + p.tn) / (p.tp + p.fn + p.fp + p.tn);
      case 'precision': return p.tp / (p.tp + p.fp);
      case 'recall': return p.tp / (p.tp + p.fn);
      case 'backprop': {
        const z = p.w * p.x + p.b, h = Math.max(0, z), delta = p.v * h + p.c - p.y;
        if (z === 0) return undefined;
        return p.variable === 'v' ? delta * h : delta * p.v * (z > 0 ? 1 : 0) * (p.variable === 'w' ? p.x : 1);
      }
      default: return undefined;
    }
  }
  function equal(a, b) { return typeof a === 'number' && typeof b === 'number' ? Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-10 : a === b; }
  function verify(question) {
    try {
      if (!question || !Array.isArray(question.choices) || question.choices.length !== 4 || !Number.isInteger(question.correct) || question.correct < 0 || question.correct > 3) return false;
      const answer = expected(question.calculation);
      if (answer === undefined || !equal(question.choices[question.correct].value, answer)) return false;
      if (new Set(question.choices.map(c => c.text)).size !== 4) return false;
      if (question.choices.filter(c => equal(c.value, answer)).length !== 1) return false;
      if (!question.choices.every(c => typeof c.text === 'string' && c.text.length > 0 && typeof c.explanation === 'string' && c.explanation.length > 0)) return false;
      if (!question.choices.every(c => {
        if (typeof c.value !== 'number') return true;
        if (!/^-?\d+(?:\/\d+)?$/.test(c.text)) return false;
        const [numerator, denominator = '1'] = c.text.split('/');
        return Number(denominator) !== 0 && equal(Number(numerator) / Number(denominator), c.value);
      })) return false;
      if (!question.recall || !question.recall.answer || !question.recall.checklist.length) return false;
      return true;
    } catch (_) { return false; }
  }

  function generate(seed, count = 12) {
    if (!Number.isInteger(count) || count < 0 || count > 1000) throw new RangeError('Question count must be an integer from 0 to 1000.');
    const random = rngFrom(seed);
    const r = { random, int: (a, b) => a + Math.floor(random() * (b - a + 1)), pick: a => a[Math.floor(random() * a.length)] };
    r.nz = (a, b) => { let v; do { v = r.int(a, b); } while (!v); return v; };
    const kinds = Object.keys(factories), output = [];
    let cycle = [];
    for (let index = 0; index < count; index++) {
      if (!cycle.length) cycle = shuffled(kinds, random);
      const kind = cycle.pop();
      let complete;
      for (let attempt = 0; attempt < 200 && !complete; attempt++) {
        const draft = factories[kind](r);
        if (!draft) continue;
        const distinct = [draft.answer];
        for (const c of draft.distractors) {
          if (!distinct.some(old => old.text === c.text || equal(old.value, c.value))) distinct.push(c);
          if (distinct.length === 4) break;
        }
        if (distinct.length < 4) continue;
        const choices = shuffled(distinct, random);
        const { answer, distractors, ...fields } = draft;
        const q = { id: `V${seed}-${index + 1}`, part: 'V', adapted: true, generated: true, ...fields, choices, correct: choices.indexOf(answer) };
        if (verify(q)) complete = q;
      }
      if (!complete) throw new Error(`Unable to make a valid ${kind} question.`);
      output.push(complete);
    }
    return output;
  }
  root.StudyVariants = Object.freeze({ generate, verify });
})(typeof window !== 'undefined' ? window : globalThis);
