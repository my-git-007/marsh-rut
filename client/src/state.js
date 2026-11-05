// What this browser knows about itself: where its hunter sits, its call state, the animals it is drawing,
// and the host it talks to (the simulation in this tab for solo play, or the marsh server).
import { PI } from '../../shared/util.js';

export const Q = new URLSearchParams(location.search);
export const TEST = Q.get('test');

// this player's stand (set when the host seats us)
export const PLAYER = { x: 0, z: 0, y: 0, eye: 0, yaw: 0, stand: 0, id: null, name: '' };
export const PPT = {
  get x() {
    return PLAYER.x;
  },
  get z() {
    return PLAYER.z;
  },
};
export const bearingOf = (a) => Math.round(((Math.atan2(a.x - PLAYER.x, -(a.z - PLAYER.z)) * 180) / PI + 360) % 360);

// local clock and the state of this player's calling
export const G = { time: 0, callType: 'long', callEnd: 0, callStart: 0, callDur: 1, lastCallEnd: -999, lastKey: {} };

// the moose views being drawn (bulls, cows, calves); critter views live in models/critters.js (CRITTERS)
export const ANIMALS = [];
export const VIEWS = new Map(); // id -> view (moose or critter)

export const NET = { host: null, hunters: [] }; // host: LocalHost | RemoteHost (net/hosts.js); hunters: everyone in the marsh
export const UI = { helpOn: true, debugOn: false };
