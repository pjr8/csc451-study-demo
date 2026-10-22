(function (root) {
  'use strict';

  var MINUTE = 60 * 1000;
  var DAY = 24 * 60 * MINUTE;
  var GOOD_INTERVALS = [DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY, 60 * DAY];
  var RATINGS = ['again', 'hard', 'good'];

  function isNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
  }

  function isCount(value) {
    return isNumber(value) && Number.isInteger(value);
  }

  function validRecord(record) {
    return !!record && typeof record === 'object' && !Array.isArray(record) &&
      isCount(record.repetitions) && isCount(record.lapses) &&
      isNumber(record.intervalMs) && record.intervalMs > 0 &&
      isNumber(record.dueAt) && isNumber(record.lastReviewedAt) &&
      RATINGS.indexOf(record.rating) !== -1;
  }

  function now(value) {
    return isNumber(value) && value <= Number.MAX_SAFE_INTEGER - GOOD_INTERVALS[5]
      ? Math.floor(value) : Date.now();
  }

  // This is a transparent review heuristic, not an optimized memory model.
  // Repetitions count scheduled Good ratings since the last Again. Early Good
  // practice keeps its existing schedule; Hard does not advance the count.
  function rate(previousRecord, rating, nowMs) {
    var previous = validRecord(previousRecord) ? previousRecord : null;
    var choice = RATINGS.indexOf(rating) !== -1 ? rating : 'again';
    var reviewedAt = now(nowMs);
    var repetitions = previous ? previous.repetitions : 0;
    var lapses = previous ? previous.lapses : 0;
    var keepGoodSchedule = choice === 'good' && previous &&
      previous.rating === 'good' && reviewedAt < previous.dueAt;
    var intervalMs;

    if (choice === 'again') {
      intervalMs = 2 * MINUTE;
      repetitions = 0;
      lapses = Math.min(Number.MAX_SAFE_INTEGER, lapses + 1);
    } else if (choice === 'hard') {
      intervalMs = Math.max(10 * MINUTE, previous ? Math.floor(previous.intervalMs / 2) : 0);
      intervalMs = Math.min(intervalMs, GOOD_INTERVALS[5]);
    } else if (keepGoodSchedule) {
      intervalMs = previous.intervalMs;
    } else {
      intervalMs = GOOD_INTERVALS[Math.min(repetitions, GOOD_INTERVALS.length - 1)];
      repetitions = Math.min(Number.MAX_SAFE_INTEGER, repetitions + 1);
    }

    return {
      repetitions: repetitions,
      intervalMs: intervalMs,
      dueAt: keepGoodSchedule ? previous.dueAt : reviewedAt + intervalMs,
      lastReviewedAt: reviewedAt,
      lapses: lapses,
      rating: choice
    };
  }

  function entries(records) {
    if (!records || typeof records !== 'object' || Array.isArray(records)) return [];
    return Object.keys(records).reduce(function (result, id) {
      if (validRecord(records[id])) result.push([id, records[id]]);
      return result;
    }, []);
  }

  function dueIds(records, nowMs) {
    var cutoff = now(nowMs);
    return entries(records).filter(function (entry) {
      return entry[1].dueAt <= cutoff;
    }).sort(function (a, b) {
      return a[1].dueAt - b[1].dueAt || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
    }).map(function (entry) {
      return entry[0];
    });
  }

  function summary(records, nowMs) {
    var cutoff = now(nowMs);
    var valid = entries(records);
    var result = {
      total: valid.length,
      due: 0,
      upcoming: 0,
      learning: 0,
      mastered: 0,
      nextDueAt: null,
      invalid: records && typeof records === 'object' && !Array.isArray(records)
        ? Object.keys(records).length - valid.length : 0
    };
    valid.forEach(function (entry) {
      var record = entry[1];
      if (record.dueAt <= cutoff) result.due += 1;
      else result.upcoming += 1;
      if (record.rating === 'good' && record.repetitions >= 3) result.mastered += 1;
      else result.learning += 1;
      if (result.nextDueAt === null || record.dueAt < result.nextDueAt) result.nextDueAt = record.dueAt;
    });
    return result;
  }

  root.StudyScheduler = Object.freeze({ rate: rate, dueIds: dueIds, summary: summary });
}(globalThis));
