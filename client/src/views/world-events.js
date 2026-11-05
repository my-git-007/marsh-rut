// Turns what the host reports into things on screen and in your ears: animals appearing and leaving,
// grunts, moans, raking, brush, crashes, antler clacks, distant howls, and other hunters' calls.
import { STANDS, groundAt } from '../../../shared/world.js';
import {
  bullGrunts,
  cowMoan,
  playBrush,
  playCrack,
  playCrash,
  playClack,
  playAmb,
  playOtherCall,
  playOtherPour,
  A_ok,
} from '../audio/audio.js';
import { MooseView } from './moose-view.js';
import { CritterView } from './critter-view.js';
import { NET, PLAYER, VIEWS } from '../state.js';

const MOOSE = new Set(['bull', 'cow', 'calf']);
export function spawnView(a) {
  if (VIEWS.has(a.id)) return VIEWS.get(a.id);
  const v = MOOSE.has(a.kind) ? new MooseView(a.id, a.vis) : new CritterView(a.id, a.vis);
  VIEWS.set(a.id, v);
  return v;
}
export function removeView(id) {
  const v = VIEWS.get(id);
  if (v) {
    v.dispose();
    VIEWS.delete(id);
  }
}
export function updateViews(dt, states) {
  for (const [id, v] of VIEWS) v.update(dt, states.get(id));
}

// test scenes (?test=moves, ?test=meshy): a box of captions, one line (or block) per key
const CAPS = new Map();
export function showCaption(k, text) {
  let el = document.getElementById('testcap');
  if (!el) {
    el = document.createElement('div');
    el.id = 'testcap';
    el.style.cssText =
      'position:absolute;left:16px;top:16px;z-index:5;pointer-events:none;white-space:pre;background:rgba(14,10,6,.72);color:#f4e6c4;padding:10px 14px;border-left:3px solid #c6905b;font:15px/1.6 Georgia,serif';
    document.body.appendChild(el);
  }
  CAPS.set(k, text);
  el.textContent = [...CAPS.values()].join('\n');
}
function hunterStand(id) {
  const h = NET.hunters.find((x) => x.id === id);
  return h ? STANDS[h.stand] : null;
}
export function handleEvent(ev) {
  const v = ev.id != null ? VIEWS.get(ev.id) : null;
  switch (ev.e) {
    case 'spawn':
      spawnView(ev.a);
      break;
    case 'gone':
      removeView(ev.id);
      break;
    case 'thrash':
      if (v) v.thrashFx(ev.d, ev.x, ev.z);
      break;
    case 'grunts':
      if (v) bullGrunts(v, ev.n, { rate: ev.rate, vol: ev.vol });
      break;
    case 'moan':
      if (v) cowMoan(v, v.kind === 'calf');
      break;
    case 'brush':
      if (A_ok()) playBrush(ev.x, groundAt(ev.x, ev.z) + 1, ev.z, ev.len, ev.gain, ev.rate, ev.bus);
      break;
    case 'crack':
      if (A_ok()) playCrack(ev.x, groundAt(ev.x, ev.z) + 1, ev.z, ev.v);
      break;
    case 'crash':
      if (A_ok()) playCrash(ev.x, groundAt(ev.x, ev.z) + 1, ev.z);
      break;
    case 'clack':
      playClack(ev.x, ev.z);
      break;
    case 'amb':
      if (A_ok()) playAmb(ev.cat, { bands: { [ev.band || 'far']: 1 }, gain: ev.gain || 1.5 });
      break;
    case 'call':
      if (ev.hunter !== PLAYER.id) {
        const s = hunterStand(ev.hunter);
        if (s) playOtherCall(s, ev.clip);
      }
      break;
    case 'caption':
      showCaption(ev.k, ev.text);
      break;
    case 'pour':
      if (ev.hunter !== PLAYER.id) {
        const s = hunterStand(ev.hunter);
        if (s) playOtherPour(s);
      }
      break;
  }
}
