(function (root) {
  'use strict';

  const COUNT_KEYS = ['tp', 'fn', 'fp', 'tn'];
  const MAX_COUNT = 10000;
  const PRESETS = {
    exam: { name: 'Exam table', counts: { tp: 8, fn: 2, fp: 8, tn: 82 } },
    recall: { name: 'High recall', counts: { tp: 10, fn: 0, fp: 30, tn: 60 } },
    precision: { name: 'High precision', counts: { tp: 5, fn: 5, fp: 1, tn: 89 } },
    negative: { name: 'Always “not spam”', counts: { tp: 0, fn: 10, fp: 0, tn: 90 } },
    balanced: { name: 'Balanced classes', counts: { tp: 40, fn: 10, fp: 10, tn: 40 } },
    empty: { name: 'Zero counts', counts: { tp: 0, fn: 0, fp: 0, tn: 0 } }
  };
  const METRIC_INFO = {
    precision: {
      label: 'Precision', question: 'When it predicts spam, how often is it right?',
      numerator: ['tp'], denominator: ['tp', 'fp'],
      formula: '<span class="lesson-numerator">TP</span> / <span class="lesson-denominator">(TP + FP)</span>',
      equation: c => `${c.tp} ÷ (${c.tp} + ${c.fp})`,
      meaning: (c, m) => `The model flagged ${m.predictedPositive} emails as spam. ${c.tp} really were spam. Precision measures the reliability of its spam predictions. False positives lower precision; false negatives are outside this denominator.`,
      undefined: 'There are no predicted positives: TP + FP = 0. There are no spam predictions whose correctness we can measure.',
      memory: 'Precision → predicted positives.'
    },
    recall: {
      label: 'Recall', question: 'Of all the real spam, how much did it catch?',
      numerator: ['tp'], denominator: ['tp', 'fn'],
      formula: '<span class="lesson-numerator">TP</span> / <span class="lesson-denominator">(TP + FN)</span>',
      equation: c => `${c.tp} ÷ (${c.tp} + ${c.fn})`,
      meaning: (c, m) => `There were ${m.actualPositive} actual spam emails. The model caught ${c.tp} and missed ${c.fn}. Recall measures how much real spam was found. False negatives lower recall; false positives are outside this denominator. Recall is also called sensitivity or the true positive rate.`,
      undefined: 'There are no actual positives: TP + FN = 0. There is no real spam to measure how much was caught.',
      memory: 'Recall → real positives.'
    },
    accuracy: {
      label: 'Accuracy', question: 'Of all the decisions, how many were correct?',
      numerator: ['tp', 'tn'], denominator: COUNT_KEYS,
      formula: '<span class="lesson-numerator">(TP + TN)</span> / <span class="lesson-denominator">(TP + FN + FP + TN)</span>',
      equation: c => `(${c.tp} + ${c.tn}) ÷ (${c.tp} + ${c.fn} + ${c.fp} + ${c.tn})`,
      meaning: (c, m) => `${c.tp + c.tn} of ${m.total} predictions were correct. Both true positives and true negatives count. Accuracy can look impressive when one class is common, even if the model never finds the rare class.`,
      undefined: 'There are no examples: TP + FN + FP + TN = 0. Accuracy cannot be calculated on an empty table.',
      memory: 'Accuracy → all correct / all examples.'
    },
    f1: {
      label: 'F1 score', question: 'How well does it balance precision and recall?',
      numerator: ['tp'], denominator: ['tp', 'fp', 'fn'],
      formula: '<span class="lesson-numerator">2 × TP</span> / <span class="lesson-denominator">(2 × TP + FP + FN)</span>',
      equation: c => `(2 × ${c.tp}) ÷ (2 × ${c.tp} + ${c.fp} + ${c.fn})`,
      meaning: () => 'F1 is the harmonic mean of precision and recall: 2PR / (P + R), when those terms are defined. A low value in either metric pulls F1 down. This count formula gives TP twice the weight in both numerator and denominator. True negatives are not used.',
      undefined: 'There are no true positives, false positives, or false negatives: 2 × TP + FP + FN = 0. F1 is undefined. If this denominator is positive but TP = 0, F1 is 0.',
      memory: 'F1 → a balance, not the arithmetic average.'
    },
    specificity: {
      label: 'Specificity', question: 'Of all the real non-spam, how much did it leave alone?',
      numerator: ['tn'], denominator: ['tn', 'fp'],
      formula: '<span class="lesson-numerator">TN</span> / <span class="lesson-denominator">(TN + FP)</span>',
      equation: c => `${c.tn} ÷ (${c.tn} + ${c.fp})`,
      meaning: (c, m) => `There were ${m.actualNegative} actual non-spam emails. The model correctly left ${c.tn} alone. Specificity measures how well it recognizes actual negatives. False positives lower specificity. It is also called the true negative rate.`,
      undefined: 'There are no actual negatives: TN + FP = 0. There is no real non-spam to measure how much was correctly left alone.',
      memory: 'Specificity → real negatives.'
    }
  };

  const thresholdSamples = Object.freeze([
    ...[.96, .92, .88, .82, .73, .65, .54, .42, .31, .18].map(score => Object.freeze({ positive: true, score })),
    ...[.91, .78, .63, .57, .48, .39, .28, .21, .12, .05].map(score => Object.freeze({ positive: false, score }))
  ]);

  function parseCount(value) {
    if (typeof value === 'string') {
      if (!/^\d+$/.test(value.trim())) return null;
      value = Number(value.trim());
    }
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_COUNT ? value : null;
  }

  function metrics(input) {
    if (!input || typeof input !== 'object') throw new TypeError('A confusion matrix is required.');
    const counts = {};
    for (const key of COUNT_KEYS) {
      const value = parseCount(input[key]);
      if (value === null) throw new TypeError(`${key.toUpperCase()} must be a whole number from 0 to ${MAX_COUNT}.`);
      counts[key] = value;
    }
    const { tp, fn, fp, tn } = counts;
    const ratio = (numerator, denominator) => ({ numerator, denominator, value: denominator === 0 ? null : numerator / denominator });
    return {
      counts, total: tp + fn + fp + tn,
      actualPositive: tp + fn, actualNegative: fp + tn,
      predictedPositive: tp + fp, predictedNegative: fn + tn,
      precision: ratio(tp, tp + fp), recall: ratio(tp, tp + fn),
      accuracy: ratio(tp + tn, tp + fn + fp + tn),
      f1: ratio(2 * tp, 2 * tp + fp + fn), specificity: ratio(tn, tn + fp)
    };
  }

  function thresholdCounts(threshold, samples = thresholdSamples) {
    if (typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
      throw new TypeError('Threshold must be a number from 0 to 1.');
    }
    if (!Array.isArray(samples) || samples.length > MAX_COUNT) throw new TypeError('Invalid threshold examples.');
    const counts = { tp: 0, fn: 0, fp: 0, tn: 0 };
    for (const sample of samples) {
      if (!sample || typeof sample.positive !== 'boolean' || typeof sample.score !== 'number' || !Number.isFinite(sample.score) || sample.score < 0 || sample.score > 1) {
        throw new TypeError('Each example needs a true class and a score from 0 to 1.');
      }
      const predictedPositive = sample.score >= threshold;
      counts[sample.positive ? (predictedPositive ? 'tp' : 'fn') : (predictedPositive ? 'fp' : 'tn')]++;
    }
    return counts;
  }

  const formatNumber = value => value.toLocaleString('en-US');
  const formatDecimal = value => value.toFixed(4).replace(/\.?0+$/, '');
  const formatPercent = value => value === null ? '—' : `${Number((value * 100).toFixed(2))}%`;
  let active = null;

  function matrixMarkup(id, counts, totals = true) {
    return `<div class="lesson-table-wrap"><table class="lesson-matrix" id="${id}">
      <caption>Positive = spam. Rows show actual class; columns show predicted class.</caption>
      <thead><tr><th scope="col">Actual ↓<br>Predicted →</th><th scope="col">Spam <span>(positive)</span></th><th scope="col">Not spam <span>(negative)</span></th>${totals ? '<th scope="col">Actual total</th>' : ''}</tr></thead>
      <tbody><tr><th scope="row">Spam <span>(positive)</span></th><td data-cell="tp"><span class="lesson-cell-label">TP · found spam</span><strong class="lesson-cell-value">${counts.tp}</strong></td><td data-cell="fn"><span class="lesson-cell-label">FN · missed spam</span><strong class="lesson-cell-value">${counts.fn}</strong></td>${totals ? `<td class="lesson-total" data-total="actualPositive">${counts.tp + counts.fn}</td>` : ''}</tr>
      <tr><th scope="row">Not spam <span>(negative)</span></th><td data-cell="fp"><span class="lesson-cell-label">FP · false alarm</span><strong class="lesson-cell-value">${counts.fp}</strong></td><td data-cell="tn"><span class="lesson-cell-label">TN · left alone</span><strong class="lesson-cell-value">${counts.tn}</strong></td>${totals ? `<td class="lesson-total" data-total="actualNegative">${counts.fp + counts.tn}</td>` : ''}</tr></tbody>
      ${totals ? `<tfoot><tr><th scope="row">Predicted total</th><td data-total="predictedPositive">${counts.tp + counts.fp}</td><td data-total="predictedNegative">${counts.fn + counts.tn}</td><td data-total="total">${counts.tp + counts.fn + counts.fp + counts.tn}</td></tr></tfoot>` : ''}
    </table></div>`;
  }

  function markup() {
    const exam = PRESETS.exam.counts;
    return `<article class="lesson-root" aria-labelledby="lesson-title">
      <header class="lesson-hero"><span class="lesson-eyebrow">Learn</span><h1 id="lesson-title">Classification metrics</h1><p class="lesson-intro">Read the table. Try the numbers. Check yourself.</p>
        <nav class="lesson-jump" aria-label="Lesson sections"><a href="#lesson-read"><span>01</span> Table</a><a href="#lesson-lab"><span>02</span> Calculate</a><a href="#lesson-threshold"><span>03</span> Threshold</a><a href="#lesson-check"><span>04</span> Self-check</a></nav>
      </header>

      <section class="lesson-section" id="lesson-read" aria-labelledby="lesson-read-title">
        <div class="lesson-section-heading"><span class="lesson-number">01</span><div><h2 id="lesson-read-title">Read the table</h2><p>Positive = spam · Negative = not spam</p></div></div>
        <div class="lesson-grid two lesson-table-guide"><div><h3>100-email example</h3>${matrixMarkup('lesson-example-matrix', exam)}<p class="lesson-axis-note"><strong>Actual row → predicted column.</strong><br>Check the labels: other tables may reverse the axes.</p></div><div class="lesson-grid two lesson-definitions">
          <div class="lesson-card lesson-definition"><strong>TP · True positive</strong><span>It was spam. The model predicted spam.</span><p><b>8</b> spam emails caught correctly.</p></div>
          <div class="lesson-card lesson-definition"><strong>FN · False negative</strong><span>It was spam. The model predicted not spam.</span><p><b>2</b> spam emails missed.</p></div>
          <div class="lesson-card lesson-definition"><strong>FP · False positive</strong><span>It was not spam. The model predicted spam.</span><p><b>8</b> legitimate emails wrongly flagged.</p></div>
          <div class="lesson-card lesson-definition"><strong>TN · True negative</strong><span>It was not spam. The model predicted not spam.</span><p><b>82</b> legitimate emails correctly left alone.</p></div>
        </div></div>
        <details class="lesson-details"><summary>How to remember TP, FP, FN, TN</summary><div class="lesson-details-body"><p>“Positive” names the class we want to detect. It does not mean good. Always identify the positive class before calculating a metric.</p><p>Read the <strong>second word first</strong>: positive = predicted spam; negative = predicted not spam. Then read the first word: true = correct; false = incorrect.</p><p>A <strong>false positive</strong> is a positive prediction that was wrong: legitimate mail flagged as spam. A <strong>false negative</strong> is a negative prediction that was wrong: spam allowed through.</p><p>False positive = false alarm. False negative = miss. They describe different mistakes and can have very different costs.</p><figure class="lesson-figure"><button type="button" class="lesson-image-open" data-lesson-image aria-label="Enlarge confusion matrix illustration"><img src="assets/confusion-matrix.png" width="1536" height="1024" alt="A confusion matrix with actual classes in rows and predicted classes in columns. True positives and true negatives are correct; false positives and false negatives are mistakes." loading="lazy" decoding="async"></button><figcaption>True = correct prediction. Positive or negative = predicted class. Tap to enlarge.</figcaption></figure></div></details>
      </section>

      <section class="lesson-section" id="lesson-lab" aria-labelledby="lesson-lab-title">
        <div class="lesson-section-heading"><span class="lesson-number">02</span><div><h2 id="lesson-lab-title">Calculate</h2><p>Pick a metric. Edit the counts.</p></div></div>
        <div class="lesson-lab">
          <div class="lesson-presets" aria-label="Example tables">${Object.entries(PRESETS).map(([key, preset]) => `<button class="lesson-button secondary" type="button" data-lesson-preset="${key}" aria-pressed="${key === 'exam'}">${preset.name}</button>`).join('')}</div>
          <div class="lesson-inputs">${COUNT_KEYS.map(key => `<label for="lesson-count-${key}"><span>${key.toUpperCase()} · ${{tp: 'found spam', fn: 'missed spam', fp: 'false alarms', tn: 'left alone'}[key]}</span><input id="lesson-count-${key}" data-lesson-count="${key}" type="number" inputmode="numeric" min="0" max="${MAX_COUNT}" step="1" value="${exam[key]}" aria-describedby="lesson-input-help lesson-validation"></label>`).join('')}</div>
          <p class="lesson-input-help" id="lesson-input-help">Whole numbers, 0–10,000 per cell.</p><p class="lesson-validation" id="lesson-validation" role="status" aria-live="polite"></p>
          <div class="lesson-metric-tabs" role="tablist" aria-label="Explore a metric">${['precision', 'recall', 'accuracy', 'f1'].map((key, index) => `<button type="button" role="tab" id="lesson-tab-${key}" aria-controls="lesson-metric-panel" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}" data-lesson-metric="${key}">${METRIC_INFO[key].label}</button>`).join('')}</div>
          <div class="lesson-grid two"><div>${matrixMarkup('lesson-live-matrix', exam)}<div class="lesson-legend"><span><i class="lesson-key numerator" aria-hidden="true"></i>Numerator + denominator</span><span><i class="lesson-key denominator" aria-hidden="true"></i>Denominator only</span><span><i class="lesson-key inactive" aria-hidden="true"></i>Not used</span></div><p class="lesson-highlight-note" id="lesson-highlight-note"></p></div>
          <div class="lesson-card lesson-metric-result" id="lesson-metric-panel" role="tabpanel" aria-labelledby="lesson-tab-precision" tabindex="0"><h3 id="lesson-metric-title"></h3><p id="lesson-metric-question"></p><p class="lesson-formula" id="lesson-metric-formula"></p><p class="lesson-equation" id="lesson-metric-equation"></p><strong class="lesson-score" id="lesson-metric-score"></strong><p class="lesson-decimal" id="lesson-metric-decimal"></p><p class="lesson-callout" id="lesson-metric-memory"></p><details class="lesson-details lesson-result-details" data-lesson-explanation><summary>Why this answer?</summary><p class="lesson-metric-copy" id="lesson-metric-copy"></p></details></div></div>
          <details class="lesson-details"><summary>More metrics · specificity &amp; false positive rate</summary><div class="lesson-details-body"><p><strong>Specificity</strong> answers: of all actual non-spam, how much did the model correctly leave alone?</p><p class="lesson-formula">TN / (TN + FP) = <span id="lesson-specificity-equation"></span></p><p><strong>False positive rate</strong> answers: of all actual non-spam, how much was wrongly flagged?</p><p class="lesson-formula">FP / (FP + TN) = <span id="lesson-fpr-equation"></span></p><p>These share the actual-negative denominator. When it is nonzero, false positive rate = 1 − specificity. False positive rate is <strong>not</strong> 1 − precision: precision uses predicted positives.</p></div></details>
        </div>
        <details class="lesson-details"><summary>Precision vs. recall · visual guide</summary><div class="lesson-details-body"><figure class="lesson-figure lesson-wide-figure"><button type="button" class="lesson-image-open" data-lesson-image aria-label="Enlarge precision and recall illustration"><img src="assets/precision-recall.png" width="1536" height="1024" alt="Precision compares true positives with all predicted positives. Recall compares true positives with all actual positives." loading="lazy" decoding="async"></button><figcaption>Precision: predicted positives. Recall: actual positives. Tap to enlarge.</figcaption></figure></div></details>
        <details class="lesson-details"><summary>Common exam traps · F1 &amp; high accuracy</summary><div class="lesson-details-body"><div class="lesson-grid two"><div class="lesson-card"><h3>F1 ≠ ordinary average</h3><p>In the exam table, precision = 50% and recall = 80%.</p><p class="lesson-formula">F1 = 2 × 0.5 × 0.8 / (0.5 + 0.8)<br>= 0.6154 ≈ <strong>61.54%</strong></p><p>The arithmetic average is 65%, which is <strong>not F1</strong>. The harmonic mean penalizes a weak metric more. Report precision and recall too; one score hides the trade-off.</p></div><div class="lesson-card"><h3>Accuracy can hide misses</h3><p>Suppose 90 emails are legitimate and 10 are spam. Predict “not spam” every time.</p><div class="lesson-stats"><div class="lesson-stat"><strong>90%</strong><span>Accuracy</span></div><div class="lesson-stat"><strong>0%</strong><span>Recall</span></div><div class="lesson-stat"><strong>—</strong><span>Precision</span></div></div><p>Ninety correct negatives make accuracy look good. But all 10 spam emails get through. Precision is undefined because the model never predicts spam.</p><button type="button" class="lesson-button secondary" data-lesson-preset="negative">Try this table</button></div></div></div></details>
        <details class="lesson-details"><summary>What does “undefined” mean?</summary><div class="lesson-details-body"><p>Division by zero has no defined value. We show <strong>—</strong> instead of silently assigning zero. “No predictions to judge” is different from “predictions were all wrong.”</p><p>If TP = 0 and FP &gt; 0, precision is 0: the model predicted spam, but none was spam. If TP + FP = 0, precision is undefined: there were no positive predictions at all.</p><p>Some software substitutes 0 or another value for reporting. Check its zero-division convention. For a hand calculation, identify the zero denominator explicitly.</p></div></details>
      </section>

      <section class="lesson-section" id="lesson-threshold" aria-labelledby="lesson-threshold-title">
        <div class="lesson-section-heading"><span class="lesson-number">03</span><div><h2 id="lesson-threshold-title">Move the threshold</h2><p>Same 20 emails · 10 spam, 10 not spam</p></div></div>
        <div class="lesson-card"><label class="lesson-threshold-control" for="lesson-threshold-slider"><span>Predict spam when score ≥ <output id="lesson-threshold-value" for="lesson-threshold-slider">0.50</output></span><input id="lesson-threshold-slider" type="range" min="0" max="100" value="50" step="1" aria-describedby="lesson-threshold-help"><span class="lesson-range-labels"><span>0.00 · flag all</span><span>1.00 · flag none here</span></span></label>
          <p id="lesson-threshold-help">Outlined emails are predicted spam. Color shows the true class.</p><div class="lesson-dot-legend"><span><i class="lesson-dot positive" aria-hidden="true"></i>Actual spam</span><span><i class="lesson-dot negative" aria-hidden="true"></i>Actual not spam</span></div><div class="lesson-dots" id="lesson-threshold-dots" aria-label="Twenty fixed email scores"></div>
          <p class="lesson-threshold-summary" id="lesson-threshold-summary"></p><div class="lesson-stats" id="lesson-threshold-stats"></div>
        </div>
        <div class="lesson-threshold-takeaways"><strong>Lower threshold → recall stays or rises.</strong><strong>Precision can rise or fall.</strong></div>
        <details class="lesson-details"><summary>Why the metrics change</summary><div class="lesson-details-body"><p>The model assigns each email an estimated probability of being spam. A threshold turns that score into a yes/no prediction. These are fixed teaching examples: 10 real spam and 10 real non-spam.</p><p>On a fixed dataset, lowering the threshold cannot decrease recall. It can turn missed spam into true positives. It can also turn correct negatives into false alarms, so specificity cannot increase.</p><p>The newly flagged emails may be mostly real spam or mostly legitimate mail. Their mix determines whether precision rises or falls. Do not assume every lower threshold lowers precision.</p></div></details>
        <details class="lesson-details"><summary>Which metric should I care about?</summary><div class="lesson-details-body"><p><strong>Missing positives is costly:</strong> pay close attention to recall. A low recall means many positives were missed.</p><p><strong>False alarms are costly:</strong> examine precision and false positives. Also inspect specificity when you need the fraction of actual negatives left alone.</p><p><strong>Classes are imbalanced:</strong> do not judge by accuracy alone. Inspect the matrix and the positive-class metrics.</p><p><strong>Need a summary of precision and recall:</strong> F1 can help, but it does not encode the real cost of each mistake. No metric is universally best.</p></div></details>
      </section>

      <section class="lesson-section" id="lesson-check" aria-labelledby="lesson-check-title">
        <div class="lesson-section-heading"><span class="lesson-number">04</span><div><h2 id="lesson-check-title">Self-check</h2><p>Answer first. Tap to reveal.</p></div></div>
        <div class="lesson-checks">
          <details class="lesson-check"><summary><span>01</span> A legitimate email is flagged as spam. Which cell?</summary><p><strong>False positive.</strong> “Positive” means the model predicted spam. “False” means that prediction was wrong. Actual non-spam row, predicted spam column.</p></details>
          <details class="lesson-check"><summary><span>02</span> TP = 8, FP = 8, FN = 2. What are precision and recall?</summary><p><strong>Precision = 8 / 16 = 50%.</strong> Sixteen predicted positives, eight correct. <strong>Recall = 8 / 10 = 80%.</strong> Ten actual positives, eight caught. Swapping the denominators swaps the questions.</p></details>
          <details class="lesson-check"><summary><span>03</span> It predicts “not spam” for all 100 emails. Ten are spam. Is 90% accuracy enough?</summary><p><strong>No: recall is 0 / 10 = 0%.</strong> The model misses every spam email. Precision is undefined because TP + FP = 0. Accuracy is 90 / 100 = 90%, carried entirely by correct negatives.</p></details>
          <details class="lesson-check"><summary><span>04</span> Lower the threshold. Must recall rise? Must precision fall?</summary><p><strong>Recall cannot decrease, but it may stay the same.</strong> Lowering the threshold adds positive predictions. Existing true positives remain. <strong>Precision need not fall:</strong> it depends on the true classes of the newly flagged emails. Specificity cannot increase on the same fixed dataset.</p></details>
        </div>
        <div class="lesson-practice"><h3>Put it into practice</h3><button class="lesson-button" type="button" data-lesson-practice>Practice metrics <span aria-hidden="true">→</span></button></div>
        <details class="lesson-details"><summary>References</summary><div class="lesson-details-body"><p>Definitions and calculation conventions: scikit-learn’s official documentation for <a href="https://scikit-learn.org/stable/modules/generated/sklearn.metrics.confusion_matrix.html" target="_blank" rel="noopener noreferrer">confusion matrices</a>, <a href="https://scikit-learn.org/stable/modules/generated/sklearn.metrics.precision_score.html" target="_blank" rel="noopener noreferrer">precision</a>, <a href="https://scikit-learn.org/stable/modules/generated/sklearn.metrics.recall_score.html" target="_blank" rel="noopener noreferrer">recall</a>, and <a href="https://scikit-learn.org/stable/modules/generated/sklearn.metrics.f1_score.html" target="_blank" rel="noopener noreferrer">F1</a>.</p><p>This lesson uses binary classification with spam as the positive class. Undefined ratios are displayed as —.</p></div></details>
      </section>
      <dialog class="lesson-image-dialog" aria-label="Expanded learning illustration"><button type="button" class="lesson-image-close" data-lesson-image-close autofocus>Close <span aria-hidden="true">×</span></button><img class="lesson-image-expanded" alt="" hidden><p class="lesson-image-caption"></p></dialog>
    </article>`;
  }

  function setText(container, selector, text) {
    const node = container.querySelector(selector);
    if (node) node.textContent = text;
  }

  function updateMatrix(table, result) {
    for (const key of COUNT_KEYS) {
      const node = table.querySelector(`[data-cell="${key}"] .lesson-cell-value`);
      node.textContent = formatNumber(result.counts[key]);
      node.dataset.digits = String(node.textContent.length);
    }
    for (const node of table.querySelectorAll('[data-total]')) node.textContent = formatNumber(result[node.dataset.total]);
  }

  function updateLab(state) {
    const { container, counts, metric } = state;
    const result = metrics(counts), info = METRIC_INFO[metric], value = result[metric];
    const table = container.querySelector('#lesson-live-matrix');
    updateMatrix(table, result);
    for (const cell of table.querySelectorAll('[data-cell]')) {
      const key = cell.dataset.cell;
      cell.classList.toggle('lesson-numerator', info.numerator.includes(key));
      cell.classList.toggle('lesson-denominator', info.denominator.includes(key));
      cell.classList.toggle('lesson-inactive', !info.denominator.includes(key));
    }
    for (const tab of container.querySelectorAll('[data-lesson-metric]')) {
      const selected = tab.dataset.lessonMetric === metric;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    container.querySelector('#lesson-metric-panel').setAttribute('aria-labelledby', `lesson-tab-${metric}`);
    setText(container, '#lesson-metric-title', info.label);
    setText(container, '#lesson-metric-question', info.question);
    container.querySelector('#lesson-metric-formula').innerHTML = info.formula;
    setText(container, '#lesson-metric-equation', `${info.equation(counts)} = ${value.numerator} ÷ ${value.denominator}`);
    setText(container, '#lesson-metric-score', formatPercent(value.value));
    setText(container, '#lesson-metric-decimal', value.value === null ? 'Undefined · zero denominator' : `${formatDecimal(value.value)} as a decimal`);
    setText(container, '#lesson-metric-copy', value.value === null ? info.undefined : info.meaning(counts, result));
    const explanation = container.querySelector('[data-lesson-explanation]');
    if (value.value === null) explanation.open = true;
    setText(container, '#lesson-metric-memory', info.memory);
    setText(container, '#lesson-highlight-note', metric === 'f1' ? 'F1 counts TP twice. The highlighted cells show which counts are used; use the coefficients in the formula.' : `Numerator: ${info.numerator.map(x => x.toUpperCase()).join(' + ')}. Denominator: ${info.denominator.map(x => x.toUpperCase()).join(' + ')}.`);
    setText(container, '#lesson-specificity-equation', `${counts.tn} / (${counts.tn} + ${counts.fp}) = ${formatPercent(result.specificity.value)}${result.specificity.value === null ? ' (undefined)' : ''}`);
    const fpr = result.actualNegative ? counts.fp / result.actualNegative : null;
    setText(container, '#lesson-fpr-equation', `${counts.fp} / (${counts.fp} + ${counts.tn}) = ${formatPercent(fpr)}${fpr === null ? ' (undefined)' : ''}`);
  }

  function updateThreshold(state) {
    const { container, threshold } = state;
    const result = metrics(thresholdCounts(threshold));
    setText(container, '#lesson-threshold-value', threshold.toFixed(2));
    container.querySelector('#lesson-threshold-slider').setAttribute('aria-valuetext', `${threshold.toFixed(2)}. Predict spam at or above this score.`);
    const dots = container.querySelector('#lesson-threshold-dots');
    if (!dots.childElementCount) {
      for (let index = 0; index < thresholdSamples.length; index++) {
        const dot = container.ownerDocument.createElement('span');
        dot.className = `lesson-dot ${thresholdSamples[index].positive ? 'positive' : 'negative'}`;
        dot.setAttribute('role', 'img');
        dot.textContent = thresholdSamples[index].score.toFixed(2);
        dots.append(dot);
      }
    }
    [...dots.children].forEach((dot, index) => {
      const sample = thresholdSamples[index], predicted = sample.score >= threshold;
      dot.classList.toggle('predicted-positive', predicted);
      const label = `Email ${index + 1}: actually ${sample.positive ? 'spam' : 'not spam'}, score ${sample.score.toFixed(2)}, predicted ${predicted ? 'spam' : 'not spam'}.`;
      dot.setAttribute('aria-label', label);
      dot.title = label;
    });
    const c = result.counts;
    setText(container, '#lesson-threshold-summary', `TP ${c.tp} · FN ${c.fn} · FP ${c.fp} · TN ${c.tn} — ${result.predictedPositive} emails flagged as spam.`);
    container.querySelector('#lesson-threshold-stats').innerHTML = ['precision', 'recall', 'specificity', 'accuracy', 'f1'].map(key => `<div class="lesson-stat"><strong>${formatPercent(result[key].value)}</strong><span>${METRIC_INFO[key].label}${result[key].value === null ? ' · undefined' : ''}</span></div>`).join('');
  }

  function unmount() {
    if (!active) return;
    active.container.removeEventListener('click', active.onClick);
    active.container.removeEventListener('input', active.onInput);
    active.container.removeEventListener('keydown', active.onKeydown);
    const dialog = active.container.querySelector('.lesson-image-dialog');
    if (dialog) {
      if (dialog.open) dialog.close();
      dialog.remove();
    }
    active = null;
  }

  function mount(container, options = {}) {
    if (!container || typeof container.querySelector !== 'function') throw new TypeError('A lesson container is required.');
    unmount();
    container.innerHTML = markup();
    if (root.LESSON_IMAGES) {
      if (typeof root.LESSON_IMAGES.confusion === 'string') container.querySelector('img[src="assets/confusion-matrix.png"]').src = root.LESSON_IMAGES.confusion;
      if (typeof root.LESSON_IMAGES.comparison === 'string') container.querySelector('img[src="assets/precision-recall.png"]').src = root.LESSON_IMAGES.comparison;
    }
    const state = { container, counts: { ...PRESETS.exam.counts }, metric: 'precision', threshold: .5, onPractice: options.onPractice };
    function selectMetric(key, focus = false) {
      if (!['precision', 'recall', 'accuracy', 'f1'].includes(key)) return;
      state.metric = key;
      updateLab(state);
      if (focus) container.querySelector(`#lesson-tab-${key}`).focus();
    }
    state.onClick = event => {
      const target = event.target.closest('button');
      if (!target || !container.contains(target)) return;
      if (target.hasAttribute('data-lesson-image')) {
        const source = target.querySelector('img');
        const dialog = container.querySelector('.lesson-image-dialog');
        const expanded = dialog.querySelector('img');
        expanded.src = source.currentSrc || source.src;
        expanded.alt = source.alt;
        expanded.hidden = false;
        dialog.querySelector('.lesson-image-caption').textContent = target.closest('figure').querySelector('figcaption').textContent.replace(/ Tap (?:the illustration to enlarge|to enlarge)\./, '');
        dialog.showModal();
      } else if (target.hasAttribute('data-lesson-image-close')) {
        container.querySelector('.lesson-image-dialog').close();
      } else if (target.hasAttribute('data-lesson-preset')) {
        const key = target.dataset.lessonPreset, preset = PRESETS[key];
        if (!preset) return;
        state.counts = { ...preset.counts };
        for (const input of container.querySelectorAll('[data-lesson-count]')) {
          input.value = state.counts[input.dataset.lessonCount];
          input.removeAttribute('aria-invalid');
        }
        for (const button of container.querySelectorAll('.lesson-presets [data-lesson-preset]')) button.setAttribute('aria-pressed', String(button.dataset.lessonPreset === key));
        setText(container, '#lesson-validation', '');
        updateLab(state);
        if (!target.closest('.lesson-presets')) {
          container.querySelector('#lesson-lab').scrollIntoView({ behavior: root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
        }
      } else if (target.hasAttribute('data-lesson-metric')) {
        selectMetric(target.dataset.lessonMetric);
      } else if (target.hasAttribute('data-lesson-practice') && typeof state.onPractice === 'function') {
        state.onPractice();
      }
    };
    state.onInput = event => {
      const target = event.target;
      if (target.hasAttribute('data-lesson-count')) {
        const values = {}, invalid = [];
        for (const input of container.querySelectorAll('[data-lesson-count]')) {
          const value = parseCount(input.value), valid = value !== null;
          input.setAttribute('aria-invalid', String(!valid));
          if (valid) values[input.dataset.lessonCount] = value;
          else invalid.push(input.dataset.lessonCount.toUpperCase());
        }
        for (const button of container.querySelectorAll('.lesson-presets [data-lesson-preset]')) button.setAttribute('aria-pressed', 'false');
        setText(container, '#lesson-validation', invalid.length ? `${invalid.join(', ')}: enter a whole number from 0 to ${MAX_COUNT.toLocaleString('en-US')}. The table keeps the last valid values until every input is valid.` : '');
        if (invalid.length) return;
        state.counts = values;
        updateLab(state);
      } else if (target.id === 'lesson-threshold-slider') {
        const next = Number(target.value);
        if (!Number.isFinite(next) || next < 0 || next > 100) return;
        state.threshold = next / 100;
        updateThreshold(state);
      }
    };
    state.onKeydown = event => {
      const target = event.target.closest('[data-lesson-metric]');
      if (!target) return;
      const keys = ['precision', 'recall', 'accuracy', 'f1'], current = keys.indexOf(target.dataset.lessonMetric);
      let next;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (current + 1) % keys.length;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (current + keys.length - 1) % keys.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = keys.length - 1;
      else return;
      event.preventDefault();
      selectMetric(keys[next], true);
    };
    container.addEventListener('click', state.onClick);
    container.addEventListener('input', state.onInput);
    container.addEventListener('keydown', state.onKeydown);
    active = state;
    updateLab(state);
    updateThreshold(state);
  }

  root.StudyLessons = Object.freeze({ mount, unmount, metrics, parseCount, thresholdCounts, thresholdSamples });
})(typeof globalThis !== 'undefined' ? globalThis : this);
