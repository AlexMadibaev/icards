const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_EASE = 2.5;
const MIN_EASE = 1.3;
const MAX_EASE = 3;
const UNLEARNED_INTERVAL_DAYS = 10 / (24 * 60);
const MAX_SYNC_LENGTH = 2_000_000;
const MAX_SYNC_DEPTH = 30;
const MAX_SYNC_NODES = 50_000;
const SYNC_FORMAT = "italian-cards-sync";

export const SYNC_DATA_VERSION = 1;

const REVIEW_RESULTS = new Set(["learned", "repeat", "unlearned"]);
const UNSAFE_OBJECT_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const INVALID_SYNC_VALUE = Symbol("invalid sync value");

/**
 * Makes an answer suitable for comparison while preserving letters and accents.
 * Punctuation, letter case and extra whitespace do not affect the result.
 */
export function normalizeAnswer(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase(["ru-RU", "it-IT"])
    .replace(/ё/g, "е")
    .replace(/[\p{P}\p{S}]+/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Returns the Levenshtein edit distance between two strings. */
export function getEditDistance(first, second) {
  let source = Array.from(String(first ?? ""));
  let target = Array.from(String(second ?? ""));

  // Keeping the target as the shorter string limits memory usage to O(min(n, m)).
  if (source.length < target.length) {
    [source, target] = [target, source];
  }

  let previousRow = Array.from({ length: target.length + 1 }, (_, index) => index);

  for (let sourceIndex = 1; sourceIndex <= source.length; sourceIndex += 1) {
    const currentRow = [sourceIndex];

    for (let targetIndex = 1; targetIndex <= target.length; targetIndex += 1) {
      const substitutionCost =
        source[sourceIndex - 1] === target[targetIndex - 1] ? 0 : 1;

      currentRow[targetIndex] = Math.min(
        currentRow[targetIndex - 1] + 1,
        previousRow[targetIndex] + 1,
        previousRow[targetIndex - 1] + substitutionCost,
      );
    }

    previousRow = currentRow;
  }

  return previousRow[target.length];
}

/**
 * Evaluates a typed answer. Expected variants can be separated with `/`, `;`
 * or `|`, or supplied as an array.
 *
 * @returns {"learned" | "repeat" | "unlearned"}
 */
export function evaluateAnswer(value, expectedAnswer) {
  const answer = normalizeAnswer(value);
  const expectedValues = Array.isArray(expectedAnswer)
    ? expectedAnswer
    : String(expectedAnswer ?? "").split(/[\/;|]/);
  const variants = expectedValues.map(normalizeAnswer).filter(Boolean);

  if (!answer || variants.length === 0) {
    return "unlearned";
  }

  if (variants.includes(answer)) {
    return "learned";
  }

  const closestVariant = variants.reduce(
    (closest, variant) => {
      const distance = getEditDistance(answer, variant);
      return distance < closest.distance ? { distance, variant } : closest;
    },
    { distance: Number.POSITIVE_INFINITY, variant: "" },
  );
  const typoLimit = closestVariant.variant.length >= 8 ? 2 : 1;

  return closestVariant.variant.length >= 4 && closestVariant.distance <= typoLimit
    ? "repeat"
    : "unlearned";
}

/**
 * Applies a review result without mutating the original ticket.
 *
 * Schedule rules:
 * - learned: 1 day, then 3 days, then the previous interval multiplied by ease;
 * - repeat: review again in 1 day and reduce the current interval;
 * - unlearned: review again in 10 minutes and restart the interval.
 */
export function applyReview(ticket, result, now = new Date()) {
  const source = isPlainObject(ticket) ? ticket : {};
  const reviewResult = REVIEW_RESULTS.has(result) ? result : "unlearned";
  const reviewedAt = toValidDate(now);
  const previousInterval = toNonNegativeNumber(source.intervalDays, 0);
  const previousEase = clamp(
    toFiniteNumber(source.ease, DEFAULT_EASE),
    MIN_EASE,
    MAX_EASE,
  );

  let intervalDays;
  let ease;

  if (reviewResult === "learned") {
    if (previousInterval < 1) {
      intervalDays = 1;
    } else if (previousInterval < 3) {
      intervalDays = 3;
    } else {
      intervalDays = Math.max(previousInterval + 1, Math.round(previousInterval * previousEase));
    }

    ease = clamp(previousEase + 0.05, MIN_EASE, MAX_EASE);
  } else if (reviewResult === "repeat") {
    intervalDays = previousInterval <= 1 ? 1 : Math.max(1, Math.round(previousInterval / 2));
    ease = clamp(previousEase - 0.15, MIN_EASE, MAX_EASE);
  } else {
    intervalDays = UNLEARNED_INTERVAL_DAYS;
    ease = clamp(previousEase - 0.2, MIN_EASE, MAX_EASE);
  }

  const wasCorrect = reviewResult === "learned";

  return {
    ...source,
    status: reviewResult,
    dueAt: new Date(reviewedAt.getTime() + intervalDays * DAY_IN_MS).toISOString(),
    lastReviewedAt: reviewedAt.toISOString(),
    intervalDays,
    ease: roundTo(ease, 2),
    correctCount: toNonNegativeInteger(source.correctCount) + (wasCorrect ? 1 : 0),
    wrongCount: toNonNegativeInteger(source.wrongCount) + (wasCorrect ? 0 : 1),
    reviewCount: toNonNegativeInteger(source.reviewCount) + 1,
  };
}

/** A ticket without a valid due date is treated as ready for review. */
export function isDue(ticket, now = new Date()) {
  if (!isPlainObject(ticket) || !ticket.dueAt) {
    return true;
  }

  const dueTimestamp = Date.parse(ticket.dueAt);

  if (!Number.isFinite(dueTimestamp)) {
    return true;
  }

  return dueTimestamp <= toValidDate(now).getTime();
}

/**
 * Adds one answer to the profile's daily history and XP total.
 * Daily entries have the shape `{ date, reviews, correct, repeated, wrong, xp }`.
 */
export function updateDailyProgress(profile, result, date = new Date()) {
  const source = isPlainObject(profile) ? profile : {};
  const reviewResult = REVIEW_RESULTS.has(result) ? result : "unlearned";
  const dateKey = toDateKey(date);
  const dailyHistory = normalizeDailyHistory(source.dailyHistory);
  const currentEntry = normalizeDailyEntry(dailyHistory[dateKey], dateKey);
  const earnedXp = reviewResult === "learned" ? 10 : reviewResult === "repeat" ? 5 : 0;
  const nextEntry = {
    ...currentEntry,
    date: dateKey,
    reviews: currentEntry.reviews + 1,
    correct: currentEntry.correct + (reviewResult === "learned" ? 1 : 0),
    repeated: currentEntry.repeated + (reviewResult === "repeat" ? 1 : 0),
    wrong: currentEntry.wrong + (reviewResult === "unlearned" ? 1 : 0),
    xp: currentEntry.xp + earnedXp,
  };
  const nextHistory = {
    ...dailyHistory,
    [dateKey]: nextEntry,
  };
  const dailyGoal = Math.max(1, toNonNegativeInteger(source.dailyGoal) || 10);

  return {
    ...source,
    dailyGoal,
    xp: toNonNegativeInteger(source.xp) + earnedXp,
    dailyHistory: nextHistory,
    streak: getStreak(nextHistory, dateKey),
    dailyGoalReached: nextEntry.reviews >= dailyGoal,
  };
}

/**
 * Counts consecutive active days. A day is active when it contains at least one
 * review. Before today's first review, yesterday's still-active streak is kept.
 */
export function getStreak(dailyHistory, today = new Date()) {
  const history = normalizeDailyHistory(dailyHistory);
  const activeDates = new Set(
    Object.entries(history)
      .filter(([, entry]) => hasDailyActivity(entry))
      .map(([date]) => date),
  );
  let cursor = toDateKey(today);

  if (!activeDates.has(cursor)) {
    cursor = shiftDateKey(cursor, -1);
  }

  let streak = 0;

  while (activeDates.has(cursor)) {
    streak += 1;
    cursor = shiftDateKey(cursor, -1);
  }

  return streak;
}

/**
 * Serializes JSON-compatible sync data into a small versioned envelope.
 * Returns `null` for cyclic, unsupported or excessively large data.
 */
export function serializeSyncData(data) {
  try {
    const payload = sanitizeSyncValue(data, new Set(), { count: 0 }, 0);

    if (payload === INVALID_SYNC_VALUE || !isPlainObject(payload)) {
      return null;
    }

    const serialized = JSON.stringify({
      format: SYNC_FORMAT,
      version: SYNC_DATA_VERSION,
      payload,
    });

    return serialized.length <= MAX_SYNC_LENGTH ? serialized : null;
  } catch {
    return null;
  }
}

/**
 * Parses data produced by `serializeSyncData`. Plain JSON objects are accepted
 * as a backwards-compatible import format. Invalid input returns `null`.
 */
export function parseSyncData(serialized) {
  if (typeof serialized !== "string" || serialized.length === 0 || serialized.length > MAX_SYNC_LENGTH) {
    return null;
  }

  try {
    const parsed = JSON.parse(serialized);
    let payload = parsed;

    if (isPlainObject(parsed) && parsed.format === SYNC_FORMAT) {
      if (parsed.version !== SYNC_DATA_VERSION || !("payload" in parsed)) {
        return null;
      }

      payload = parsed.payload;
    }

    const safePayload = sanitizeSyncValue(payload, new Set(), { count: 0 }, 0);
    return safePayload !== INVALID_SYNC_VALUE && isPlainObject(safePayload) ? safePayload : null;
  } catch {
    return null;
  }
}

function toFiniteNumber(value, fallback = 0) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toNonNegativeNumber(value, fallback = 0) {
  return Math.max(0, toFiniteNumber(value, fallback));
}

function toNonNegativeInteger(value) {
  return Math.max(0, Math.floor(toFiniteNumber(value, 0)));
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundTo(value, decimals) {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function toValidDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : new Date(0);
}

function toDateKey(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    const check = new Date(Date.UTC(year, month - 1, day));

    if (
      check.getUTCFullYear() === year &&
      check.getUTCMonth() === month - 1 &&
      check.getUTCDate() === day
    ) {
      return value;
    }
  }

  const date = toValidDate(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDateKey(dateKey, numberOfDays) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + numberOfDays));
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function normalizeDailyHistory(dailyHistory) {
  if (Array.isArray(dailyHistory)) {
    return dailyHistory.reduce((history, entry) => {
      if (isPlainObject(entry) && typeof entry.date === "string") {
        const date = toDateKey(entry.date);
        history[date] = normalizeDailyEntry(entry, date);
      }

      return history;
    }, {});
  }

  if (!isPlainObject(dailyHistory)) {
    return {};
  }

  return Object.entries(dailyHistory).reduce((history, [key, entry]) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
      const date = toDateKey(key);
      history[date] = normalizeDailyEntry(entry, date);
    }

    return history;
  }, {});
}

function normalizeDailyEntry(entry, date) {
  const source = isPlainObject(entry) ? entry : {};

  return {
    ...source,
    date,
    reviews: toNonNegativeInteger(source.reviews),
    correct: toNonNegativeInteger(source.correct),
    repeated: toNonNegativeInteger(source.repeated),
    wrong: toNonNegativeInteger(source.wrong),
    xp: toNonNegativeInteger(source.xp),
  };
}

function hasDailyActivity(entry) {
  return isPlainObject(entry) && toNonNegativeInteger(entry.reviews) > 0;
}

function sanitizeSyncValue(value, ancestors, state, depth) {
  state.count += 1;

  if (state.count > MAX_SYNC_NODES || depth > MAX_SYNC_DEPTH) {
    return INVALID_SYNC_VALUE;
  }

  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : INVALID_SYNC_VALUE;
  }

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : INVALID_SYNC_VALUE;
  }

  if (typeof value !== "object" || ancestors.has(value)) {
    return INVALID_SYNC_VALUE;
  }

  ancestors.add(value);

  if (Array.isArray(value)) {
    const safeArray = [];

    for (const item of value) {
      const safeItem = sanitizeSyncValue(item, ancestors, state, depth + 1);

      if (safeItem === INVALID_SYNC_VALUE) {
        ancestors.delete(value);
        return INVALID_SYNC_VALUE;
      }

      safeArray.push(safeItem);
    }

    ancestors.delete(value);
    return safeArray;
  }

  if (!isPlainObject(value)) {
    ancestors.delete(value);
    return INVALID_SYNC_VALUE;
  }

  const safeObject = {};

  for (const key of Object.keys(value)) {
    if (UNSAFE_OBJECT_KEYS.has(key)) {
      continue;
    }

    const safeItem = sanitizeSyncValue(value[key], ancestors, state, depth + 1);

    if (safeItem === INVALID_SYNC_VALUE) {
      ancestors.delete(value);
      return INVALID_SYNC_VALUE;
    }

    safeObject[key] = safeItem;
  }

  ancestors.delete(value);
  return safeObject;
}
