// Bits every map uses (shared/maps/*.js).
export const WATER_Y = -0.35; // the level of all open water: streams, ponds and pools

// The view lane in front of each stand (kept clear of trees and brush), and how far a point is from the nearest stand.
// yaw: the direction the hunter faces when seated (0 = north, i.e. looking toward -z).
export function standHelpers(STANDS) {
  return {
    inStandCorridor(x, z, maxD) {
      for (const s of STANDS) {
        const px = x - s.x,
          pz = z - s.z;
        const fw = -Math.sin(s.yaw) * px - Math.cos(s.yaw) * pz,
          side = Math.cos(s.yaw) * px - Math.sin(s.yaw) * pz;
        if (fw > 0 && Math.abs(side) < fw * 0.85 + 3 && Math.hypot(px, pz) < maxD) return true;
      }
      return false;
    },
    nearestStandDist(x, z) {
      let d = 1e9;
      for (const s of STANDS) d = Math.min(d, Math.hypot(x - s.x, z - s.z));
      return d;
    },
  };
}
// The edge of the open ground (where marshE crosses 0) along a bearing from the map's middle, with the outward
// direction: where animals step out of the timber.
export function edgeFinder(MARSH, marshE) {
  return (ang) => {
    const dx = Math.cos(ang),
      dz = Math.sin(ang);
    let lo = 0,
      hi = MARSH.reach || 900;
    for (let k = 0; k < 30; k++) {
      const m = (lo + hi) / 2;
      if (marshE(MARSH.cx + dx * m, MARSH.cz + dz * m) < 0) lo = m;
      else hi = m;
    }
    return { x: MARSH.cx + dx * lo, z: MARSH.cz + dz * lo, nx: dx, nz: dz };
  };
}
