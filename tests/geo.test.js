"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  haversine,
  totalDistance,
  formatKm,
  formatDuration,
  formatDurationShort,
  formatPace,
  computeElevation,
  dedupeConsecutivePoints,
  validateRoute,
} = require("../extracted/geo.js");

test("haversine: distance between identical points is 0", () => {
  const p = { lat: -34.6, lng: -58.4 };
  assert.equal(haversine(p, p), 0);
});

test("haversine: ~111km per degree of latitude at the equator", () => {
  const a = { lat: 0, lng: 0 };
  const b = { lat: 1, lng: 0 };
  const d = haversine(a, b);
  assert.ok(Math.abs(d - 111195) < 500, `expected ~111195m, got ${d}`);
});

test("totalDistance sums consecutive haversine legs", () => {
  const points = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 0.001 },
    { lat: 0, lng: 0.002 },
  ];
  const d = totalDistance(points);
  const expected = haversine(points[0], points[1]) + haversine(points[1], points[2]);
  assert.equal(d, expected);
});

test("totalDistance of a single point is 0", () => {
  assert.equal(totalDistance([{ lat: 1, lng: 1 }]), 0);
});

test("formatKm formats meters as km with 2 decimals", () => {
  assert.equal(formatKm(1234), "1.23 km");
});

test("formatDuration formats milliseconds as HH:MM:SS", () => {
  assert.equal(formatDuration(3661000), "01:01:01");
});

test("formatDurationShort uses h/m shorthand", () => {
  assert.equal(formatDurationShort(90 * 60000), "1h 30m");
  assert.equal(formatDurationShort(45 * 60000), "45 min");
  assert.equal(formatDurationShort(0), "—");
});

test("formatPace returns --:-- for too-short distances", () => {
  assert.equal(formatPace(10, 60000), "--:--");
});

test("formatPace computes minutes per km", () => {
  assert.equal(formatPace(1000, 6 * 60000), "06:00");
});

test("computeElevation returns null when altitude coverage is too sparse", () => {
  const points = [{ alt: 100 }, { alt: null }, { alt: null }, { alt: null }, { alt: null }];
  assert.equal(computeElevation(points), null);
});

test("computeElevation computes gain/loss with enough altitude coverage", () => {
  const points = [{ alt: 0 }, { alt: 10 }, { alt: 20 }, { alt: 10 }, { alt: 0 }];
  const result = computeElevation(points);
  assert.ok(result);
  assert.ok(result.gain > 0);
  assert.ok(result.loss > 0);
  assert.equal(result.profile.length, 5);
});

test("dedupeConsecutivePoints drops exact repeats but keeps distinct points", () => {
  const points = [
    { lat: 1, lng: 1 },
    { lat: 1, lng: 1 },
    { lat: 2, lng: 2 },
    { lat: 2, lng: 2 },
    { lat: 2, lng: 2 },
    { lat: 3, lng: 3 },
  ];
  assert.deepStrictEqual(dedupeConsecutivePoints(points), [
    { lat: 1, lng: 1 },
    { lat: 2, lng: 2 },
    { lat: 3, lng: 3 },
  ]);
});

test("validateRoute rejects fewer than 2 points", () => {
  const result = validateRoute({ points: [{ lat: 1, lng: 1 }], activity: "trekking" });
  assert.equal(result.ok, false);
});

test("validateRoute rejects out-of-range coordinates", () => {
  const result = validateRoute({
    points: [
      { lat: 1, lng: 1 },
      { lat: 200, lng: 1 },
    ],
    activity: "trekking",
  });
  assert.equal(result.ok, false);
});

test("validateRoute rejects zero distance", () => {
  const result = validateRoute({
    points: [
      { lat: 1, lng: 1 },
      { lat: 1, lng: 1 },
    ],
    activity: "trekking",
  });
  assert.equal(result.ok, false);
});

test("validateRoute accepts a normal route and warns about very short distance", () => {
  const result = validateRoute({
    points: [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 0.0002 },
    ],
    activity: "trekking",
    source: "recorded",
    duration: 60000,
  });
  assert.equal(result.ok, true);
  assert.ok(result.warnings.some((w) => w.includes("100 m")));
});

test("validateRoute flags unrealistic speed jumps", () => {
  const t0 = Date.now();
  const result = validateRoute({
    points: [
      { lat: 0, lng: 0, t: t0 },
      { lat: 1, lng: 0, t: t0 + 1000 },
    ],
    activity: "trekking",
    source: "recorded",
    duration: 1000,
  });
  assert.equal(result.ok, true);
  assert.ok(result.warnings.some((w) => w.toLowerCase().includes("salto")));
});
