"""Build the reference bull's palms straight from "Bull Moose Reference Sheet.png".

Each palm's exact outline (points and all) is cut out of the REAR view. It is given real thickness
(round across the points, a plate across the blade), then bent into a cupped blade that sweeps up,
out and back, as in the side view. The back of each palm is coloured from the rear photo and the
front (the cup) from the front photo. The forward brow points are added in the game, measured from
the side view.
Output: ref-antlers.json, which build.py embeds in the game.
"""
import json, base64, os
import numpy as np
from PIL import Image
from scipy import ndimage as nd

here = os.path.dirname(os.path.abspath(__file__))
im = np.asarray(Image.open(os.path.join(here, 'Bull Moose Reference Sheet.png')).convert('RGB')).astype(np.float32)
PM = 174.0                      # pixels per metre on the sheet
CX_R, CX_F = 1142, 377          # midline of the rear and front views
V0, V1, U0, U1 = 520, 616, 1000, 1290
OFFX, OFFY, CUP, SWEEP, LEAN = -0.03, 0.1, 0.05, 0.8, 0.3
BEAMIN = 0.06   # our skull is narrower than the sheet bull's: bring the palms in so the beams stay short   # palm position vs the burr, cup depth, how far it sweeps back going out
reg = im[V0:V1, U0:U1]
mask = reg.min(axis=2) < 226
uu, vv = np.meshgrid(np.arange(U0, U1), np.arange(V0, V1))
mask &= np.abs(uu - CX_R) >= 50                     # head and ears
mask &= ~((uu >= 1261) & (vv >= 570))               # hanging velvet strip (made separately)
mask = nd.binary_closing(mask, iterations=1) & (reg.min(axis=2) < 240)
lab, n = nd.label(mask)
sizes = nd.sum(mask, lab, range(1, n + 1))
keep = [i + 1 for i in np.argsort(sizes)[::-1][:2]]

def side(lbl):
    M = lab == lbl
    s = 1 if uu[M].mean() > CX_R else -1             # +z is the bull's right = viewer's right from behind
    L = np.abs(uu - CX_R)
    root = M & (L <= 54)
    vroot = vv[root].mean()
    dt = nd.distance_transform_edt(M)
    R = nd.maximum_filter(dt, size=11)
    ht = np.sqrt(np.clip(dt * (2 * R - dt), 0, None))
    ht = np.minimum(ht, 4.2)                          # blade about 5 cm thick
    ht = nd.gaussian_filter(ht, 0.8) * M
    idx = -np.ones(M.shape, int)
    ys, xs = np.nonzero(M)
    idx[ys, xs] = np.arange(len(ys))
    fu = uu[ys, xs].astype(float); fv = vv[ys, xs].astype(float)
    # smooth the outline (pixel staircase)
    nb = [(-1, 0), (1, 0), (0, -1), (0, 1)]
    bnd = np.zeros(len(ys), bool)
    for dy, dx in nb:
        y2, x2 = ys + dy, xs + dx
        ok = (y2 >= 0) & (y2 < M.shape[0]) & (x2 >= 0) & (x2 < M.shape[1])
        inside = np.zeros(len(ys), bool); inside[ok] = M[y2[ok], x2[ok]]
        bnd |= ~inside
    nbr8 = [(a, b) for a in (-1, 0, 1) for b in (-1, 0, 1) if a or b]
    for _ in range(4):
        su = np.zeros(len(ys)); sv = np.zeros(len(ys)); cn = np.zeros(len(ys))
        for dy, dx in nbr8:
            y2, x2 = ys + dy, xs + dx
            ok = (y2 >= 0) & (y2 < M.shape[0]) & (x2 >= 0) & (x2 < M.shape[1])
            j = -np.ones(len(ys), int); j[ok] = idx[y2[ok], x2[ok]]
            use = (j >= 0) & bnd; use[use] &= bnd[j[use]]
            su[use] += fu[j[use]]; sv[use] += fv[j[use]]; cn[use] += 1
        m = bnd & (cn >= 2)
        fu[m] = fu[m] * 0.5 + su[m] / cn[m] * 0.5; fv[m] = fv[m] * 0.5 + sv[m] / cn[m] * 0.5
    # the blade: out (z), up (y), and swept back (x) as it goes out and up; cupped toward the front
    Lm = np.abs(fu - CX_R) / PM; Lr = Lm - 50 / PM; h = (vroot - fv) / PM * 1.15
    cz, cy = 0.27, 0.22
    d = np.minimum(np.hypot((Lr - cz) / 0.3, (h - cy) / 0.26), 1.15)
    X = -SWEEP * Lr - LEAN * np.clip(h, 0, None) + CUP * d * d + OFFX
    Y = h + OFFY
    Z = s * (Lm - BEAMIN)
    nrm = np.array([1.0, LEAN, SWEEP * s]); nrm /= np.linalg.norm(nrm)
    t = ht[ys, xs] / PM
    P = []
    for sg in (1, -1):
        P.append(np.stack([X + nrm[0] * t * sg, Y + nrm[1] * t * sg, Z + nrm[2] * t * sg], 1))
    P = np.concatenate(P)
    # colours: back from the rear view, front (the cup) from the front view
    def samp(u, v):
        u = np.clip(np.round(u).astype(int), 0, im.shape[1] - 1); v = np.clip(np.round(v).astype(int), 0, im.shape[0] - 1)
        return im[v, u]
    cb = samp(fu, fv)
    cf = samp(CX_F + (CX_R - fu), fv)
    bad = cf.min(axis=1) > 215                        # off the antler in the front photo: use the back colour
    cf[bad] = cb[bad]
    cf = cf * 0.8                                   # the photo's cup is lit full-on; tone it to the rest of the rack
    C = np.concatenate([cf, cb]).clip(0, 255).astype(np.uint8)
    nv = len(ys)
    tris = []
    for y in range(M.shape[0] - 1):
        for x in range(M.shape[1] - 1):
            a, b, c, e = idx[y, x], idx[y, x + 1], idx[y + 1, x + 1], idx[y + 1, x]
            q = [a, b, c, e]
            if min(q) < 0:
                # one corner missing: still close the triangle that exists
                ins = [k for k in q if k >= 0]
                if len(ins) == 3: tris.append(ins)
                continue
            tris.append([a, b, c]); tris.append([a, c, e])
    tris = np.array(tris)
    # orient front faces toward +normal
    v0, v1, v2 = P[tris[:, 0]], P[tris[:, 1]], P[tris[:, 2]]
    fn = np.cross(v1 - v0, v2 - v0)
    flip = fn @ nrm < 0
    tris[flip] = tris[flip][:, [0, 2, 1]]
    back = tris[:, [0, 2, 1]] + nv
    # walls along the outline
    from collections import Counter
    ec = Counter()
    for tr in tris:
        for i in range(3):
            a, b = tr[i], tr[(i + 1) % 3]
            ec[(a, b)] += 1
    walls = []
    for (a, b), k in ec.items():
        if (b, a) not in ec:
            walls.append([b, a, a + nv]); walls.append([b, a + nv, b + nv])
    F = np.concatenate([tris, back, np.array(walls)]).astype(np.uint16)
    Q = np.round(P * 2000).astype(np.int16)           # half-millimetre units
    print('side', s, 'verts', len(P), 'tris', len(F), 'z range', Z.min().round(2), Z.max().round(2), 'height', Y.max().round(2))
    return {'s': s, 'pos': base64.b64encode(Q.tobytes()).decode(), 'col': base64.b64encode(C.tobytes()).decode(),
            'idx': base64.b64encode(F.tobytes()).decode(), 'root': [float(OFFX + CUP * min(np.hypot(cz / 0.3, cy / 0.26), 1.15) ** 2), OFFY, s * (50 / PM - BEAMIN)]}

out = {'sides': [side(k) for k in keep]}
json.dump(out, open(os.path.join(here, 'ref-antlers.json'), 'w'))
print('wrote', os.path.getsize(os.path.join(here, 'ref-antlers.json')) // 1024, 'KB')
