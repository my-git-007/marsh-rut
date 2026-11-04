// ?test=moves: a bull, a cow and a bear in front of the stand, each playing every move its model has, one at a
// time, in a loop. Each has its own lane (the bear nearest, then the cow, then the bull) and walks or runs side-on
// along it. The browser shows which move is playing ('caption' events). ?only=bull|cow|bear shows one up close;
// ?step=N starts at move N; ?hold keeps repeating that one move; ?dist= sets the nearest lane's distance.
import { Bull } from './bull.js';
import { CowGroup } from './cows.js';
import { critter } from './wildlife.js';

// a step either travels to the other end of the lane (go: gait) or holds for t seconds; on() starts it
const STEPS = {
  bull: [
    { name: 'Walking', go: 'walk' },
    { name: 'Standing, looking at you', t: 5, on: (a, X) => (a.look = X.H) },
    { name: 'Trotting', go: 'trot' },
    { name: 'Fast trot (running off)', go: 'run' },
    { name: 'Grazing', t: 8, on: (a) => (a.grazeOn = true) },
    { name: 'Alert: head up, ears forward', t: 5, on: (a, X) => ((a.alertT = 5), (a.look = X.H)) },
    { name: 'Grunting', t: 6, on: (a, X) => (X.bull.grunts(3), X.sim.after(3, () => X.bull.grunts(3))) },
    { name: 'Head-high sway (rut display)', t: 9, on: (a) => (a.swayOn = true) },
    { name: 'Thrashing the brush with his antlers', t: 6, on: (a) => a.thrash(5) },
    { name: 'Fight stance: antlers lowered', t: 5, on: (a) => (a.fightOn = true) },
    { name: 'Shoving (fight footwork)', t: 6, on: (a) => ((a.fightOn = true), (a.shuffle = 1.6)) },
    { name: 'Bedding down', t: 10, on: (a) => (a.bedOn = true) },
    { name: 'Getting up', t: 5 },
  ],
  cow: [
    { name: 'Walking', go: 'walk' },
    { name: 'Standing, looking at you', t: 5, on: (a, X) => (a.look = X.H) },
    { name: 'Trotting', go: 'trot' },
    { name: 'Fast trot (running off)', go: 'run' },
    { name: 'Grazing', t: 8, on: (a) => (a.grazeOn = true) },
    { name: 'Alert: head up, ears forward', t: 5, on: (a, X) => ((a.alertT = 5), (a.look = X.H)) },
    {
      name: 'Calling (cow moan)',
      t: 8,
      on: (a, X) => (X.sim.emit({ e: 'moan', id: a.id }), X.sim.after(4, () => X.sim.emit({ e: 'moan', id: a.id }))),
    },
    { name: 'Bedding down', t: 10, on: (a) => (a.bedOn = true) },
    { name: 'Getting up', t: 5 },
  ],
  bear: [
    { name: 'Walking', go: 'walk' },
    { name: 'Standing, looking around', t: 6 },
    { name: 'Trotting', go: 'trot' },
    { name: 'Running (a charge)', go: 'run' },
    { name: 'Foraging, nose down', t: 8, on: (a) => (a.forageOn = true) },
    { name: 'Alert: looking at you', t: 5, on: (a, X) => ((a.alertT = 5), (a.look = X.H)) },
  ],
};
const LABEL = { bull: 'Bull', cow: 'Cow', bear: 'Bear' };

function reset(a) {
  a.grazeOn = a.swayOn = a.fightOn = a.bedOn = a.forageOn = false;
  a.shuffle = 0;
  a.look = null;
  a.alertT = 0;
  a.thrashT = 0;
}

export function setupMoves(sim, H, q) {
  const only = q('only'),
    d0 = q('dist') != null ? +q('dist') : only ? 16 : 18;
  const kinds = ['bear', 'cow', 'bull'].filter((k) => !only || k === only);
  const half = only ? 9 : 12; // half the lane's length
  const hold = q('hold') != null;
  const actors = kinds.map((k, i) => {
    const z = H.z - d0 - i * 7;
    const first = Math.min(Math.max(+(q('step') || 1), 1), STEPS[k].length) - 1;
    const X = { sim, H, k, step: hold ? first : first - 1, left: 0, end: 1, x0: H.x - half, x1: H.x + half, z };
    if (k === 'bull') {
      X.bull = new Bull(sim, { tier: 3, focus: H });
      X.bull.hold(1e9);
      X.bull.dispT = 1e9;
      sim.bulls.push(X.bull);
      X.a = X.bull.a;
    } else if (k === 'cow') {
      const cg = new CowGroup(sim, true, { calves: 0 });
      cg.state = 'frozen';
      sim.cows.push(cg);
      X.a = cg.cow;
    } else X.a = critter(sim, 'bear', { size: 'boar', coat: 'black' });
    X.a.place(hold && !STEPS[k][first].go ? H.x : X.x0, z, 0); // a held move that stays put plays in the middle
    reset(X.a);
    return X;
  });
  const next = (X) => {
    const S = STEPS[X.k];
    if (!hold) X.step = (X.step + 1) % S.length;
    const s = S[X.step],
      a = X.a;
    reset(a);
    if (s.go) {
      const x = X.end ? X.x1 : X.x0;
      X.end = 1 - X.end;
      a.goTo(x, X.z, s.go);
      X.left = 60; // in case it never quite arrives
    } else {
      a.halt();
      X.left = s.t;
    }
    if (s.on) s.on(a, X);
    sim.emit({ e: 'caption', k: X.k, text: `${LABEL[X.k]} · ${X.step + 1}/${S.length} · ${s.name}` });
  };
  for (const X of actors) next(X);
  return (dt) => {
    for (const X of actors) {
      const s = STEPS[X.k][X.step];
      X.left -= dt;
      if (X.left <= 0 || (s.go && X.a.arrived && X.a.speed < 0.3)) next(X);
    }
  };
}
