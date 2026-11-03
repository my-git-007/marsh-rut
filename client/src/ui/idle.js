// Inactivity: an online player who doesn't touch the mouse, keyboard or screen for 10 minutes is logged out
// (and their marsh on the server is closed). A warning shows a minute before. While they are active, the
// server is told so at most every 30 seconds; it closes marshes that stop hearing it, as a backstop.
export const IDLE_MS = 10 * 60000, WARN_MS = 9 * 60000;
const PING_MS = 30000;

export function watchIdle({ onWarn, onBack, onIdle, tellServer }) {
  let last = Date.now(), told = 0, warned = false, done = false;
  const touched = (e) => {
    // browsers fire zero-distance mouse events when the page changes under a still cursor: those don't count
    if (e.type === 'mousemove' && !e.movementX && !e.movementY) return;
    const now = Date.now(); last = now;
    if (warned) { warned = false; onBack(); }
    if (now - told > PING_MS) { told = now; tellServer(); }
  };
  for (const ev of ['mousemove', 'pointerdown', 'wheel', 'keydown', 'touchstart']) window.addEventListener(ev, touched, { capture: true, passive: true });
  setInterval(() => {   // checks the wall clock, so it also works after a sleeping laptop or a background tab
    if (done) return;
    const idle = Date.now() - last;
    if (idle > IDLE_MS) { done = true; onIdle(); }
    else if (idle > WARN_MS && !warned) { warned = true; onWarn(Math.ceil((IDLE_MS - idle) / 1000)); }
  }, 1000);
}
