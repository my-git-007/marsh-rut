// This player's cow calls and water pour: the recording plays right away in this browser, and the
// host is told, so every bull and cow in the marsh (and every other hunter) hears it.
import { pick } from '../../shared/util.js';
import { A, A_ok, SB, SB_READY, playBuf, fullLevel, waterPour } from './audio/audio.js';
import { G, NET } from './state.js';
import { showMsg } from './ui/input.js';

export const CALL_TYPES = {
  long: { key: '1', name: 'Long cow call', hint: 'carries far — for a bull you can’t see' },
  coax: { key: '2', name: 'Short coaxing call', hint: 'carries ~400 yds — for a bull you can see' },
};
export function callKeys(type) { return Object.keys(SB).filter((k) => k.startsWith(type === 'long' ? 'ucowL_' : 'ucowC_')); }
export function updateCallLabel() {
  const ct = CALL_TYPES[G.callType];
  document.getElementById('calltype').innerHTML = '<b>' + ct.key + '</b> ' + ct.name + ' <span>— ' + ct.hint + '</span>';
}
export function setCallType(t) { G.callType = t; updateCallLabel(); }
export function startCall() {
  if (!A_ok() || G.time < G.callEnd) return;
  if (!SB_READY) { showMsg('Loading moose recordings…', 1500); return; }
  let keys = callKeys(G.callType);
  if (!keys.length) keys = Object.keys(SB).filter((k) => k.startsWith('ucow'));
  if (!keys.length) return;
  let k = pick(keys);
  if (k === G.lastKey[G.callType] && keys.length > 1) k = pick(keys.filter((x) => x !== k));
  G.lastKey[G.callType] = k;
  const b = SB[k];
  playBuf(b, A.bus.calls, A.ctx.currentTime + 0.01, { gain: fullLevel(k) });   // the recording itself, start to finish, brought up to full level
  G.callStart = G.time; G.callDur = b.duration; G.callEnd = G.time + b.duration; G.lastCallEnd = G.callEnd;
  document.getElementById('calltxt').textContent = CALL_TYPES[G.callType].name + ' · ' + k.replace(/^ucow[LC]_/, '');
  document.getElementById('breath').style.opacity = 1;
  NET.host && NET.host.call(G.callType, b.duration, k);
}
export function pour() { if (waterPour()) NET.host && NET.host.pour(); }
