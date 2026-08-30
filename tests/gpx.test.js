"use strict";
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");

before(() => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  global.window = dom.window;
  global.document = dom.window.document;
  global.DOMParser = dom.window.DOMParser;
});

const { parseGpx, buildGpx } = require("../extracted/geo.js");

test("parseGpx extracts points, altitude, name and time", () => {
  const gpx = `<?xml version="1.0"?>
<gpx><trk><name>Test trail</name><trkseg>
<trkpt lat="10" lon="20"><ele>100</ele><time>2024-01-01T10:00:00Z</time></trkpt>
<trkpt lat="10.001" lon="20.001"><ele>105</ele><time>2024-01-01T10:00:10Z</time></trkpt>
</trkseg></trk></gpx>`;
  const result = parseGpx(gpx);
  assert.equal(result.name, "Test trail");
  assert.equal(result.points.length, 2);
  assert.equal(result.points[0].alt, 100);
  assert.equal(result.timeOrderIssue, false);
});

test("parseGpx discards points with out-of-range coordinates", () => {
  const gpx = `<gpx><trk><trkseg>
<trkpt lat="10" lon="20"></trkpt>
<trkpt lat="200" lon="20"></trkpt>
<trkpt lat="10.002" lon="20.002"></trkpt>
</trkseg></trk></gpx>`;
  const result = parseGpx(gpx);
  assert.equal(result.points.length, 2);
});

test("parseGpx flags out-of-order timestamps", () => {
  const gpx = `<gpx><trk><trkseg>
<trkpt lat="10" lon="20"><time>2024-01-01T10:00:10Z</time></trkpt>
<trkpt lat="10.001" lon="20.001"><time>2024-01-01T10:00:00Z</time></trkpt>
</trkseg></trk></gpx>`;
  const result = parseGpx(gpx);
  assert.equal(result.timeOrderIssue, true);
});

test("buildGpx escapes the route name and round-trips through parseGpx", () => {
  const route = {
    name: 'Trail <script>alert(1)</script> & "quotes"',
    points: [
      { lat: 10, lng: 20, alt: 100, t: Date.parse("2024-01-01T10:00:00Z") },
      { lat: 10.001, lng: 20.001, alt: 105, t: Date.parse("2024-01-01T10:00:10Z") },
    ],
  };
  const xml = buildGpx(route);
  assert.ok(!xml.includes("<script>"));
  const reparsed = parseGpx(xml);
  assert.equal(reparsed.points.length, 2);
  assert.equal(reparsed.points[0].alt, 100);
});
