// Messages between a browser and the marsh server (JSON over a WebSocket). Each logged-in player has
// their own private marsh on the server.
//
// browser -> server
//   { t: 'hello', v, token, stand }      join; token = Firebase ID token; stand = preferred stand index (optional)
//   { t: 'call', type, dur, clip }       a cow call started (type 'long' | 'coax', dur = clip seconds, clip = sound key)
//   { t: 'pour' }                        water pour
//   { t: 'ping', c }                     latency check
//   { t: 'active' }                      the player used mouse or keyboard lately (sent at most every 30 s)
//   { t: 'leave' }                       logging out: close my marsh now
//   { t: 'pause' } / { t: 'resume' }     the menu opened / closed: the marsh stands still meanwhile
//   { t: 'stand', stand }                change location (climb into another stand)
//   { t: 'contact', name, email, message }  the Contact form
//
// server -> browser
//   { t: 'welcome', you, hunters, spawns, snap, rate }   you = your hunter record (stand, position)
//   { t: 'denied', reason }                              'login' (token not accepted), 'verify' (email not confirmed),
//                                                        'limit' (too many new marshes from this address), 'busy', 'version', 'full'
//   { t: 'moved', you } | { t: 'moved', error }          after 'stand'
//   { t: 'contact', ok, reason?, field? }                after 'contact'
//   { t: 'idle' }                                        closed after IDLE_MINUTES without activity
//   { t: 'replaced' }                                    the same account opened the marsh in another window
//   { t: 'tick', snap, ev }                              snapshot (see Sim.snapshot) + events since the last tick
//   { t: 'hunters', list }                               someone joined or left (for shared marshes later)
//   { t: 'pong', c }
export const PROTOCOL_VERSION = 2;
export const TICK_HZ = 20;       // simulation steps per second on the server
export const SEND_EVERY = 2;     // a snapshot goes out every 2nd step (10 per second)
export const INTERP_DELAY = 0.15; // browsers draw this far (seconds) behind the newest snapshot
