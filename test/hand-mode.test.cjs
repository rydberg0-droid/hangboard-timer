const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const L = require("../logic.js");

const opts = { holdCounts: { bm1000: 17, bm2000: 20 } };
const repeater = {
  name: "7/3 리피터", prep: 10, hang: 7, repRest: 3, reps: 6, sets: 6, rest: 180,
  alt: false, grip: "half", kg: 0, board: "bm1000", hold: 7, notes: "20mm 엣지"
};

function legacyQueue(s) {
  const q = [];
  if (s.prep > 0) q.push({ t: "prep", d: s.prep });
  const arms = s.alt ? 2 : 1;
  for (let st = 1; st <= s.sets; st++) {
    for (let r = 1; r <= s.reps; r++) {
      for (let a = 0; a < arms; a++) {
        q.push({ t: "hang", d: s.hang, set: st, rep: r });
        const last = r === s.reps && a === arms - 1;
        if (!last && s.repRest > 0) q.push({ t: "rest", d: s.repRest });
      }
    }
    if (st < s.sets && s.rest > 0) q.push({ t: "setrest", d: s.rest });
  }
  return q;
}
const sig = q => q.map(p => p.t + ":" + p.d + (p.t === "hang" ? ":" + p.set + ":" + p.rep : ""));

test("chips are the requested sets and set-rest stays long", () => {
  assert.deepEqual(L.HANG_CHIPS, [5, 6, 7, 8, 9, 10]);
  assert.deepEqual(L.SHORT_REST_CHIPS, [3, 4, 5, 6, 7]);
  assert.deepEqual(L.SET_REST_CHIPS, [5, 7, 10, 15, 30, 60, 120, 180]);
});

test("7/3 repeater queue matches the previous simple timer", () => {
  const raw = Object.assign({}, repeater);
  const q = L.buildQueue(raw, opts);
  assert.equal(raw.hand, undefined);
  assert.deepEqual(sig(q), sig(legacyQueue(repeater)));
  const hangs = q.filter(p => p.t === "hang");
  assert.equal(hangs.length, 36);
  assert.ok(hangs.every(h => h.d === 7 && h.arm === "양손" && h.rep >= 1 && h.rep <= 6));
  assert.equal(q.filter(p => p.t === "rest").length, 30);
  assert.ok(q.filter(p => p.t === "rest").every(p => p.d === 3 && !p.between));
  assert.equal(q.filter(p => p.t === "setrest").length, 5);
  assert.ok(q.filter(p => p.t === "setrest").every(p => p.d === 180));
  assert.equal(L.phaseLabel(hangs[0]), "행 · 양손");
});

test("6s work / 4s between-rep rest does not double bilateral reps or replace set rest", () => {
  const p = L.normalizePreset(Object.assign({}, repeater, { prep: 0, hang: 10, repRest: 0, reps: 3, sets: 2, rest: 90 }), opts);
  L.assignField(p, p, "hang", 6);
  L.assignField(p, p, "repRest", 4);
  assert.equal(p.rest, 90);
  const q = L.buildQueue(p, opts);
  const hangs = q.filter(x => x.t === "hang");
  assert.equal(hangs.length, 6);
  assert.deepEqual(hangs.map(h => h.rep), [1, 2, 3, 1, 2, 3]);
  assert.ok(hangs.every(h => h.d === 6 && h.arm === "양손"));
  const intra = q.filter(x => x.t === "rest");
  assert.equal(intra.length, 4);
  assert.ok(intra.every(x => x.d === 4 && !x.between));
  assert.deepEqual(q.filter(x => x.t === "setrest").map(x => x.d), [90]);
  assert.equal(L.nextLabel(q, 0), "다음 · 렙 사이 휴식 4초");
  const beforeSet = q.findIndex(x => x.t === "setrest") - 1;
  assert.equal(L.nextLabel(q, beforeSet), "다음 · 세트 사이 휴식 90초");
});

test("one-arm alternate still does left then right inside the rep", () => {
  const raw = { name: "한팔", prep: 10, hang: 10, repRest: 5, reps: 2, sets: 2, rest: 180, alt: true, grip: "open", kg: 0, board: "bm1000", hold: 0, notes: "" };
  const q = L.buildQueue(raw, opts);
  assert.deepEqual(sig(q), sig(legacyQueue(raw)));
  assert.deepEqual(q.filter(p => p.t === "hang").map(p => p.arm + p.rep).slice(0, 4), ["왼손1", "오른손1", "왼손2", "오른손2"]);
  const n = L.normalizePreset(Object.assign({}, raw), opts);
  assert.equal(n.hand, "alt");
  assert.equal(n.alt, true);
  assert.equal(n.holdL, 0);
  assert.equal(n.holdR, 0);
});

test("left and right only do not double reps", () => {
  for (const hand of ["left", "right"]) {
    const p = L.normalizePreset(Object.assign({}, repeater, { reps: 2, sets: 2, hand, alt: false }), opts);
    const q = L.buildQueue(p, opts);
    const hangs = q.filter(x => x.t === "hang");
    assert.equal(hangs.length, 4);
    assert.ok(hangs.every(h => h.arm === (hand === "left" ? "왼손" : "오른손")));
  }
});

test("legacy save migrates without dropping 7/3 values and strips full crimp", () => {
  const saved = JSON.parse(JSON.stringify(repeater));
  saved.grip = "full";
  const m = L.normalizePreset(saved, opts);
  assert.equal(m.hand, "both");
  assert.equal(m.alt, false);
  assert.equal(m.grip, "half");
  assert.equal(m.hang, 7);
  assert.equal(m.repRest, 3);
  assert.equal(m.rest, 180);
  assert.equal(m.holdL, 7);
  assert.equal(m.holdR, 7);
  assert.equal(m.steps, undefined);
  const again = L.normalizePreset(JSON.parse(JSON.stringify(m)), opts);
  assert.equal(again.hang, 7);
  assert.equal(again.hand, "both");
});

test("sequence A 6s half both, 4s, B 8s open both, 2 rounds", () => {
  let p = L.normalizePreset({
    name: "서킷", prep: 0, hang: 6, repRest: 0, reps: 1, sets: 2, rest: 120,
    alt: false, hand: "both", grip: "half", kg: 0, board: "bm1000", hold: 1, notes: ""
  }, opts);
  p = L.appendStep(p, opts);
  L.assignField(p, p.steps[0], "hang", 6);
  L.assignField(p, p.steps[0], "grip", "half");
  L.assignField(p, p.steps[0], "hand", "both");
  L.assignField(p, p.steps[0], "gap", 4);
  L.assignField(p, p.steps[1], "hang", 8);
  L.assignField(p, p.steps[1], "grip", "open");
  L.assignField(p, p.steps[1], "hand", "both");
  p.steps[1].gap = 99;
  const stored = JSON.parse(JSON.stringify(L.normalizePreset(p, opts)));
  const loaded = L.normalizePreset(JSON.parse(JSON.stringify(stored)), opts);
  assert.equal(loaded.steps.length, 2);
  assert.equal(loaded.steps[0].hang, 6);
  assert.equal(loaded.steps[0].grip, "half");
  assert.equal(loaded.steps[0].gap, 4);
  assert.equal(loaded.steps[1].hang, 8);
  assert.equal(loaded.steps[1].grip, "open");
  assert.equal(loaded.rest, 120);
  assert.equal(loaded.hang, 6);
  const q = L.buildQueue(loaded, opts);
  assert.deepEqual(q.map(x => x.t + ":" + x.d + ":" + (x.arm || "") + ":" + (x.between ? "b" : "")), [
    "hang:6:양손:", "rest:4::b", "hang:8:양손:", "setrest:120::",
    "hang:6:양손:", "rest:4::b", "hang:8:양손:"
  ]);
  assert.equal(q.filter(x => x.t === "hang").length, 4);
  assert.equal(L.phaseLabel(q[0]), "행 · 양손 · 수행 1");
  assert.equal(L.nextLabel(q, 0), "다음 · 수행 사이 휴식 4초");
  assert.equal(L.nextLabel(q, 1), "다음 · 수행 2 · 양손 · 8초");
  assert.equal(q[1].grip, "open");
  assert.ok(!q.some(x => x.d === 99));
  const shared = L.presetFromShare(JSON.parse(JSON.stringify(loaded)), repeater, opts);
  assert.equal(shared.steps[1].grip, "open");
  assert.equal(shared.steps[0].gap, 4);
  assert.equal(shared.steps[1].grip === "full", false);
});

test("pause, resume, skip, and restart keep sequence timing", () => {
  const p = L.normalizePreset({
    name: "서킷", prep: 0, hang: 6, repRest: 0, reps: 1, sets: 2, rest: 120,
    hand: "both", alt: false, grip: "half", kg: 0, board: "bm1000", hold: 7, notes: "",
    steps: [
      { name: "수행 1", hang: 6, repRest: 0, reps: 1, gap: 4, hand: "both", grip: "half", board: "bm1000", hold: 7, holdL: 7, holdR: 7 },
      { name: "수행 2", hang: 8, repRest: 0, reps: 1, gap: 0, hand: "both", grip: "open", board: "bm1000", hold: 3, holdL: 3, holdR: 3 }
    ]
  }, opts);
  let now = 0;
  const run = L.createRun(p, now, opts);
  L.tickRun(run, 2000);
  assert.ok(Math.abs(run.left - 4) < 1e-6);
  assert.equal(run.hangs, 0);
  L.pauseRun(run, 2000);
  L.tickRun(run, 20000);
  assert.equal(run.paused, true);
  assert.equal(run.i, 0);
  assert.ok(Math.abs(run.left - 4) < 1e-6);
  L.resumeRun(run, 20000);
  assert.equal(run.end, 24000);
  L.tickRun(run, 24000);
  assert.equal(run.q[run.i].t, "rest");
  assert.equal(run.q[run.i].d, 4);
  assert.equal(run.q[run.i].between, true);
  assert.equal(run.hangs, 1);
  L.advanceRun(run, 24000);
  assert.equal(run.q[run.i].t, "hang");
  assert.equal(run.q[run.i].d, 8);
  assert.equal(run.q[run.i].grip, "open");
  assert.equal(run.paused, false);
  const fresh = L.createRun(p, 5000, opts);
  assert.equal(fresh.i, 0);
  assert.equal(fresh.left, 6);
  assert.equal(fresh.hangs, 0);
  assert.deepEqual(fresh.q.map(x => x.t + x.d), run.q.map(x => x.t + x.d));
  L.adjustRun(fresh, 5, 5000);
  assert.equal(fresh.left, 11);
  L.adjustRun(fresh, -100, 5000);
  assert.equal(fresh.left, 1);
});

test("alternate inside a sequence stays one rep and full crimp on a step becomes half", () => {
  const p = L.normalizePreset({
    name: "혼합", prep: 0, hang: 10, repRest: 5, reps: 1, sets: 1, rest: 30,
    hand: "both", grip: "half", kg: 2.5, board: "bm1000", hold: 0, notes: "",
    steps: [
      { name: "A", hang: 10, repRest: 5, reps: 1, gap: 4, hand: "alt", grip: "full", board: "bm1000", hold: 0, holdL: 0, holdR: 3 },
      { name: "B", hang: 8, repRest: 0, reps: 1, gap: 0, hand: "left", grip: "open", board: "bm1000", hold: 4, holdL: 4, holdR: 4 }
    ]
  }, opts);
  assert.equal(p.steps[0].grip, "half");
  assert.equal(p.kg, 2.5);
  const q = L.buildQueue(p, opts);
  assert.deepEqual(q.map(x => x.t + ":" + x.arm + ":" + x.d + ":" + x.rep), [
    "hang:왼손:10:1", "rest::5:1", "hang:오른손:10:1", "rest::4:1", "hang:왼손:8:1"
  ]);
  assert.deepEqual(L.holdsForPhase(q[0]), [{ i: 0, side: "L" }]);
  assert.deepEqual(L.holdsForPhase(q[2]), [{ i: 3, side: "R" }]);
  assert.deepEqual(L.holdsForPhase(q[4]), [{ i: 4, side: "L" }]);
});

test("old shared preset imports as both-hands and keeps alt false", () => {
  const q = L.presetFromShare({
    name: "7/3 리피터", prep: 10, hang: 7, repRest: 3, reps: 6, sets: 6, rest: 180,
    alt: false, grip: "half", kg: 0, board: "bm1000", hold: 0, notes: "20mm"
  }, Object.assign({ hand: "both", holdL: 7, holdR: 7, ex: "dead" }, repeater), opts);
  assert.equal(q.hand, "both");
  assert.equal(q.alt, false);
  assert.equal(q.holdL, 0);
  assert.equal(q.hold, 0);
  assert.equal(L.buildQueue(q, opts).filter(x => x.t === "hang").length, 36);
  const alt = L.presetFromShare(Object.assign({}, repeater, { name: "한팔", alt: "true", hold: 1 }), repeater, opts);
  assert.equal(alt.hand, "alt");
  const left = L.presetFromShare(Object.assign({}, repeater, { hand: "left", alt: false, holdL: 2, holdR: 5 }), repeater, opts);
  assert.equal(left.hand, "left");
  assert.equal(left.holdL, 2);
  assert.equal(L.buildQueue(left, opts).filter(x => x.arm === "오른손").length, 0);
});

test("reorder and remove collapse back to a simple preset", () => {
  let p = L.appendStep(L.normalizePreset(Object.assign({}, repeater), opts), opts);
  L.assignField(p, p.steps[1], "hang", 8);
  p = L.moveStep(p, 1, -1, opts);
  assert.equal(p.steps[0].hang, 8);
  assert.equal(p.hang, 8);
  p = L.removeStepAt(p, 1, opts);
  assert.equal(p.steps, undefined);
  assert.equal(p.hang, 8);
  assert.equal(p.repRest, 3);
  assert.equal(p.rest, 180);
});

test("page wires hand choices, short-rest chips, and sequence add", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.match(html, /src="logic\.js"/);
  assert.match(html, /data-h="both"/);
  assert.match(html, /data-h="left"/);
  assert.match(html, /data-h="right"/);
  assert.match(html, /data-h="alt"/);
  assert.match(html, /수행 추가/);
  assert.ok(html.indexOf('id="addstep"') < html.indexOf('id="more"'), "수행 추가 sits above the details panel");
  assert.match(html, /세트 수/);
  assert.match(html, /id="rr"/);
  assert.match(html, /렙 사이 휴식/);
  assert.match(html, /세트 사이 휴식/);
  assert.match(html, /HANG_CHIPS/);
  assert.match(html, /SHORT_REST_CHIPS/);
  assert.match(html, /SET_REST_CHIPS/);
  assert.doesNotMatch(html, /한팔 교대/);
  assert.doesNotMatch(html, /풀 크림프|full crimp|value="full"/);
});
