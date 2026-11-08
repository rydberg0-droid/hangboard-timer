/* Hangboard timing, hand mode, and exercise sequence. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HangLogic = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const HANG_CHIPS = [5, 6, 7, 8, 9, 10];
  const SHORT_REST_CHIPS = [3, 4, 5, 6, 7];
  const SET_REST_CHIPS = [5, 7, 10, 15, 30, 60, 120, 180];
  const HANDS = ["both", "left", "right", "alt"];
  const HAND_LABEL = { both: "양손", left: "왼손", right: "오른손", alt: "좌우교대" };
  const MIRROR = ["hang", "repRest", "reps", "grip", "kg", "board", "hold", "holdL", "holdR", "hand", "notes", "ex"];

  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function num(v, d) { const n = +v; return Number.isFinite(n) ? n : d; }
  function isSequence(p) { return !!(p && Array.isArray(p.steps) && p.steps.length >= 2); }

  function clampHold(v, fallback, count) {
    let x = +v;
    if (!Number.isFinite(x)) x = fallback;
    x = Math.max(0, Math.floor(x));
    if (count != null && x >= count) x = 0;
    return x;
  }
  function countFor(board, holdCounts) {
    if (!holdCounts || board === "bar") return null;
    const n = holdCounts[board];
    return typeof n === "number" ? n : null;
  }
  function clampHolds(p, holdCounts) {
    const n = countFor(p.board, holdCounts);
    p.hold = clampHold(p.hold, 0, n);
    if (p.holdL == null || p.holdL === "" || !Number.isFinite(+p.holdL)) p.holdL = p.hold;
    else p.holdL = clampHold(p.holdL, p.hold, n);
    if (p.holdR == null || p.holdR === "" || !Number.isFinite(+p.holdR)) p.holdR = p.hold;
    else p.holdR = clampHold(p.holdR, p.hold, n);
    p.hold = p.hand === "right" ? p.holdR : p.holdL;
  }

  function stepFromFlat(p) {
    const hand = HANDS.includes(p.hand) ? p.hand : (p.alt === true || p.alt === "true" || p.alt === 1 ? "alt" : "both");
    return {
      name: "수행",
      hang: num(p.hang, 7), repRest: num(p.repRest, 0), reps: num(p.reps, 1), gap: 0,
      hand: hand, alt: hand === "alt",
      grip: p.grip === "full" ? "half" : (p.grip || "half"),
      kg: num(p.kg, 0),
      board: p.board || "bm1000",
      hold: num(p.hold, 0),
      holdL: p.holdL == null || p.holdL === "" ? num(p.hold, 0) : num(p.holdL, 0),
      holdR: p.holdR == null || p.holdR === "" ? num(p.hold, 0) : num(p.holdR, 0),
      ex: p.ex || "dead",
      notes: p.notes || ""
    };
  }

  function normalizeStep(st, parent, opts) {
    const src = st && typeof st === "object" ? st : {};
    const handExplicit = HANDS.includes(src.hand);
    const hadL = src.holdL !== undefined && src.holdL !== null && src.holdL !== "";
    const hadR = src.holdR !== undefined && src.holdR !== null && src.holdR !== "";
    const s = stepFromFlat(parent || {});
    ["name", "hang", "repRest", "reps", "gap", "alt", "grip", "kg", "board", "hold", "holdL", "holdR", "hand", "notes", "ex"].forEach(k => {
      if (src[k] !== undefined && src[k] !== null) s[k] = src[k];
    });
    if (s.grip === "full") s.grip = "half";
    if (!handExplicit) s.hand = (src.alt === true || src.alt === "true" || src.alt === 1) ? "alt" : (HANDS.includes(s.hand) ? s.hand : "both");
    if (!HANDS.includes(s.hand)) s.hand = "both";
    s.alt = s.hand === "alt";
    s.hang = Math.max(1, Math.floor(num(s.hang, 7)));
    s.repRest = Math.max(0, Math.floor(num(s.repRest, 0)));
    s.reps = Math.max(1, Math.floor(num(s.reps, 1)));
    s.gap = Math.max(0, Math.floor(num(s.gap, 0)));
    s.kg = num(s.kg, 0);
    const holdCounts = (opts && opts.holdCounts) || {};
    if (s.board !== "bar" && Object.keys(holdCounts).length && !holdCounts[s.board]) s.board = "bm1000";
    if (!s.ex) s.ex = "dead";
    s.hold = num(s.hold, 0);
    if (!hadL) s.holdL = s.hold;
    if (!hadR) s.holdR = s.hold;
    clampHolds(s, holdCounts);
    s.name = String(s.name || "수행").slice(0, 80);
    s.notes = String(s.notes || "").slice(0, 200);
    s.grip = String(s.grip || "half").slice(0, 40);
    return s;
  }

  function mirrorFirst(p) {
    if (!p.steps || !p.steps[0]) return p;
    const a = p.steps[0];
    MIRROR.forEach(k => { if (a[k] !== undefined) p[k] = a[k]; });
    p.alt = p.hand === "alt";
    return p;
  }

  function normalizePreset(p, opts) {
    if (!p || typeof p !== "object" || Array.isArray(p)) return p;
    opts = opts || {};
    const holdCounts = opts.holdCounts || {};
    const rawSteps = Array.isArray(p.steps) && p.steps.length >= 2 ? p.steps.slice(0, 12) : null;
    const handExplicit = HANDS.includes(p.hand);
    if (p.grip === "full") p.grip = "half";
    ["prep", "hang", "repRest", "reps", "sets", "rest", "kg", "hold"].forEach(k => {
      if (p[k] !== undefined && p[k] !== null && p[k] !== "") {
        const v = +p[k];
        if (Number.isFinite(v)) p[k] = v;
      }
    });
    if (!handExplicit) p.hand = (p.alt === true || p.alt === "true" || p.alt === 1) ? "alt" : "both";
    if (!HANDS.includes(p.hand)) p.hand = "both";
    p.alt = p.hand === "alt";
    if (p.board !== "bar" && Object.keys(holdCounts).length && !holdCounts[p.board]) p.board = "bm1000";
    if (!p.ex) p.ex = "dead";
    const hadL = p.holdL !== undefined && p.holdL !== null && p.holdL !== "";
    const hadR = p.holdR !== undefined && p.holdR !== null && p.holdR !== "";
    if (!hadL) p.holdL = p.hold;
    if (!hadR) p.holdR = p.hold;
    clampHolds(p, holdCounts);
    p.prep = Math.max(0, Math.floor(num(p.prep, 0)));
    p.hang = Math.max(1, Math.floor(num(p.hang, 7)));
    p.repRest = Math.max(0, Math.floor(num(p.repRest, 0)));
    p.reps = Math.max(1, Math.floor(num(p.reps, 1)));
    p.sets = Math.max(1, Math.floor(num(p.sets, 1)));
    p.rest = Math.max(0, Math.floor(num(p.rest, 0)));
    p.kg = num(p.kg, 0);
    p.name = String(p.name || "프리셋").slice(0, 200);
    p.notes = String(p.notes || "").slice(0, 200);
    p.grip = String(p.grip || "half").slice(0, 40);
    if (rawSteps) {
      p.steps = rawSteps.map(st => normalizeStep(st, p, opts));
      mirrorFirst(p);
    } else delete p.steps;
    delete p.gap;
    return p;
  }

  function armsOf(step) {
    if (step.hand === "alt") return ["왼손", "오른손"];
    if (step.hand === "left") return ["왼손"];
    if (step.hand === "right") return ["오른손"];
    return ["양손"];
  }
  function snap(step, si, sequence) {
    return {
      step: si,
      name: sequence ? (step.name || ("수행 " + (si + 1))) : "",
      sequence: !!sequence,
      grip: step.grip, kg: step.kg, board: step.board, ex: step.ex || "dead",
      hold: step.hold, holdL: step.holdL, holdR: step.holdR, hand: step.hand,
      reps: step.reps, hang: step.hang
    };
  }

  function buildQueue(raw, opts) {
    const p = normalizePreset(clone(raw), opts);
    const seq = isSequence(p) ? p.steps : [normalizeStep(stepFromFlat(p), p, opts)];
    const sequence = seq.length >= 2;
    const q = [];
    if (p.prep > 0) q.push(Object.assign({ t: "prep", d: p.prep, set: 1, rep: 1, arm: "", between: false }, snap(seq[0], 0, sequence)));
    for (let set = 1; set <= p.sets; set++) {
      seq.forEach((step, si) => {
        const arms = armsOf(step);
        for (let r = 1; r <= step.reps; r++) {
          for (let a = 0; a < arms.length; a++) {
            q.push(Object.assign({ t: "hang", d: step.hang, set: set, rep: r, arm: arms[a], between: false }, snap(step, si, sequence)));
            const last = r === step.reps && a === arms.length - 1;
            if (!last && step.repRest > 0) {
              q.push(Object.assign({ t: "rest", d: step.repRest, set: set, rep: r, arm: "", between: false }, snap(step, si, sequence)));
            }
          }
        }
        if (si < seq.length - 1 && step.gap > 0) {
          const nxt = seq[si + 1];
          q.push(Object.assign({ t: "rest", d: step.gap, set: set, rep: step.reps, arm: "", between: true }, snap(nxt, si + 1, sequence)));
        }
      });
      if (set < p.sets && p.rest > 0) {
        q.push(Object.assign({ t: "setrest", d: p.rest, set: set, rep: seq[seq.length - 1].reps, arm: "", between: false }, snap(seq[0], 0, sequence)));
      }
    }
    return q;
  }

  function phaseLabel(st) {
    if (!st) return "";
    if (st.t === "prep") return "준비";
    if (st.t === "hang") {
      const base = "행" + (st.arm ? " · " + st.arm : "");
      return st.sequence && st.name ? base + " · " + st.name : base;
    }
    if (st.t === "rest") return st.between ? "수행 사이 휴식" : "렙 사이 휴식";
    if (st.t === "setrest") return "세트 사이 휴식";
    return "";
  }
  function nextLabel(q, i) {
    const n = q[i + 1];
    if (!n) return "다음 없음";
    if (n.t === "hang") return "다음 · " + (n.sequence && n.name ? n.name + " · " : "") + (n.arm || "행") + " · " + n.d + "초";
    if (n.t === "rest") return "다음 · " + (n.between ? "수행 사이 휴식" : "렙 사이 휴식") + " " + n.d + "초";
    if (n.t === "setrest") return "다음 · 세트 사이 휴식 " + n.d + "초";
    if (n.t === "prep") return "다음 · 준비";
    return "다음";
  }
  function holdsForPhase(phase) {
    if (!phase || phase.board === "bar") return [];
    const L = phase.holdL != null ? phase.holdL : phase.hold || 0;
    const R = phase.holdR != null ? phase.holdR : phase.hold || 0;
    if (phase.t === "hang") {
      if (phase.arm === "왼손") return [{ i: L, side: "L" }];
      if (phase.arm === "오른손") return [{ i: R, side: "R" }];
    } else if (phase.hand === "left") return [{ i: L, side: "L" }];
    else if (phase.hand === "right") return [{ i: R, side: "R" }];
    if (L === R) return [{ i: L, side: "B" }];
    return [{ i: L, side: "L" }, { i: R, side: "R" }];
  }

  function createRun(preset, now, opts) {
    const q = buildQueue(preset, opts);
    if (!q.length) q.push({ t: "prep", d: 1, set: 1, rep: 1, arm: "", between: false, sequence: false, d0: 1 });
    return {
      q: q, i: 0, paused: false, hangs: 0, done: false,
      left: q[0].d, end: now + q[0].d * 1000,
      s: normalizePreset(clone(preset), opts)
    };
  }
  function pauseRun(run, now) {
    if (!run || run.done || run.paused) return run;
    run.left = Math.max(0, (run.end - now) / 1000);
    run.paused = true;
    return run;
  }
  function resumeRun(run, now) {
    if (!run || run.done || !run.paused) return run;
    run.paused = false;
    run.end = now + run.left * 1000;
    return run;
  }
  function advanceRun(run, now) {
    if (!run || run.done) return run;
    if (run.q[run.i] && run.q[run.i].t === "hang") run.hangs++;
    run.i++;
    run.paused = false;
    if (run.i >= run.q.length) { run.done = true; run.left = 0; return run; }
    const st = run.q[run.i];
    run.left = st.d;
    run.end = now + st.d * 1000;
    return run;
  }
  function tickRun(run, now) {
    if (!run || run.done || run.paused) return run;
    run.left = (run.end - now) / 1000;
    if (run.left <= 0) return advanceRun(run, now);
    return run;
  }
  function adjustRun(run, delta, now) {
    if (!run || run.done) return run;
    run.left = Math.max(1, run.left + delta);
    if (!run.paused) run.end = now + run.left * 1000;
    return run;
  }

  function assignField(preset, step, key, value) {
    const simple = step === preset;
    if (key === "sets") preset.sets = Math.max(1, Math.floor(num(value, 1)));
    else if (key === "rest" || key === "prep") preset[key] = Math.max(0, Math.floor(num(value, 0)));
    else if (key === "hang") step.hang = Math.max(1, Math.floor(num(value, 1)));
    else if (key === "repRest" || key === "gap") step[key] = Math.max(0, Math.floor(num(value, 0)));
    else if (key === "reps") step.reps = Math.max(1, Math.floor(num(value, 1)));
    else if (key === "kg") step.kg = num(value, 0);
    else if (key === "hand") {
      step.hand = HANDS.includes(value) ? value : "both";
      step.alt = step.hand === "alt";
      step.hold = step.hand === "right" ? step.holdR : step.holdL;
    } else if (key === "board") {
      step.board = value === "bm2000" || value === "bar" || value === "bm1000" ? value : "bm1000";
      step.hold = step.holdL = step.holdR = 0;
    } else if (key === "grip") step.grip = value === "full" ? "half" : String(value || "half").slice(0, 40);
    else if (key === "ex") {
      step.ex = String(value || "dead").slice(0, 40);
      if (step.ex === "onearm" || step.ex === "lockoff") { step.hand = "alt"; step.alt = true; }
    } else if (key === "notes") step.notes = String(value || "").slice(0, 200);
    else if (key === "name") {
      if (simple) preset.name = String(value || "프리셋").slice(0, 200);
      else step.name = String(value || "").trim().slice(0, 80) || step.name || "수행";
    }
    if (!simple && isSequence(preset)) mirrorFirst(preset);
    else if (simple) preset.alt = preset.hand === "alt";
    return preset;
  }

  function assignHoldIndex(step, index, side) {
    const i = Math.max(0, Math.floor(num(index, 0)));
    if (step.hand === "left") { step.holdL = i; step.hold = i; return; }
    if (step.hand === "right") { step.holdR = i; step.hold = i; return; }
    if (side === "R") step.holdR = i; else step.holdL = i;
    step.hold = step.holdL;
  }

  function appendStep(preset, opts) {
    const p = normalizePreset(clone(preset), opts);
    const mk = (src, name, gap) => normalizeStep(Object.assign(stepFromFlat(src), { name: name, gap: gap }), p, opts);
    if (!isSequence(p)) {
      const first = mk(p, "수행 1", 4);
      const second = mk(p, "수행 2", 0);
      p.steps = [first, second];
    } else {
      const prev = p.steps[p.steps.length - 1];
      if (!prev.gap) prev.gap = 4;
      if (p.steps.length >= 12) return p;
      p.steps.push(mk(prev, "수행 " + (p.steps.length + 1), 0));
    }
    return mirrorFirst(p);
  }
  function removeStepAt(preset, index, opts) {
    const p = normalizePreset(clone(preset), opts);
    if (!isSequence(p) || index < 0 || index >= p.steps.length) return p;
    p.steps.splice(index, 1);
    if (p.steps.length < 2) { mirrorFirst(p); delete p.steps; delete p.gap; return p; }
    return mirrorFirst(p);
  }
  function moveStep(preset, index, dir, opts) {
    const p = normalizePreset(clone(preset), opts);
    if (!isSequence(p)) return p;
    const j = index + dir;
    if (j < 0 || j >= p.steps.length) return p;
    const tmp = p.steps[index];
    p.steps[index] = p.steps[j];
    p.steps[j] = tmp;
    return mirrorFirst(p);
  }

  const TOP_KEYS = ["name", "prep", "hang", "repRest", "reps", "sets", "rest", "alt", "grip", "kg", "board", "hold", "holdL", "holdR", "hand", "notes", "ex"];
  const STEP_KEYS = ["name", "hang", "repRest", "reps", "gap", "alt", "grip", "kg", "board", "hold", "holdL", "holdR", "hand", "notes", "ex"];
  function coerceKey(k, val, sample) {
    if (typeof sample === "number" || ["prep", "hang", "repRest", "reps", "sets", "rest", "kg", "hold", "holdL", "holdR", "gap"].includes(k)) {
      const v = +val;
      return Number.isFinite(v) ? v : (typeof sample === "number" ? sample : 0);
    }
    if (typeof sample === "boolean" || k === "alt") return val === true || val === "true" || val === 1;
    return String(val).slice(0, 200);
  }
  function presetFromShare(raw, fallback, opts) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || typeof raw.name !== "string" || !raw.name.trim()) throw new Error("bad");
    const n = clone(fallback || {});
    const handExplicit = HANDS.includes(raw.hand);
    const hadL = raw.holdL !== undefined && raw.holdL !== null && raw.holdL !== "";
    const hadR = raw.holdR !== undefined && raw.holdR !== null && raw.holdR !== "";
    TOP_KEYS.forEach(k => { if (raw[k] !== undefined) n[k] = coerceKey(k, raw[k], n[k]); });
    if (!handExplicit) delete n.hand;
    if (!hadL) delete n.holdL;
    if (!hadR) delete n.holdR;
    if (Array.isArray(raw.steps) && raw.steps.length >= 2) {
      n.steps = raw.steps.slice(0, 12).map(st => {
        const o = {};
        if (!st || typeof st !== "object") return o;
        STEP_KEYS.forEach(k => { if (st[k] !== undefined) o[k] = st[k]; });
        return o;
      });
    } else delete n.steps;
    return normalizePreset(n, opts);
  }

  return {
    HANG_CHIPS, SHORT_REST_CHIPS, SET_REST_CHIPS, HANDS, HAND_LABEL,
    clone, isSequence, normalizePreset, normalizeStep, buildQueue, phaseLabel, nextLabel, holdsForPhase,
    createRun, pauseRun, resumeRun, advanceRun, tickRun, adjustRun,
    assignField, assignHoldIndex, appendStep, removeStepAt, moveStep, mirrorFirst, presetFromShare, stepFromFlat
  };
});
