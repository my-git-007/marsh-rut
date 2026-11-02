// Messages between a browser and the marsh server (JSON over a WebSocket).
//
// browser -> server
//   { t: 'hello', name, stand }          join; stand = preferred stand index (optional)
//   { t: 'call', type, dur, clip }       a cow call started (type 'long' | 'coax', dur = clip seconds, clip = sound key)
//   { t: 'pour' }                        water pour
//   { t: 'ping', c }                     latency check
//
// server -> browser
//   { t: 'welcome', you, hunters, spawns, snap, rate }   you = your hunter record (stand, position)
//   { t: 'full' }                                        every stand is taken
//   { t: 'tick', snap, ev }                              snapshot (see Sim.snapshot) + events since the last tick
//   { t: 'hunters', list }                               someone joined or left
//   { t: 'pong', c }
export const PROTOCOL_VERSION = 1;
export const TICK_HZ = 20;       // simulation steps per second on the server
export const SEND_EVERY = 2;     // a snapshot goes out every 2nd step (10 per second)
export const INTERP_DELAY = 0.15; // browsers draw this far (seconds) behind the newest snapshot
