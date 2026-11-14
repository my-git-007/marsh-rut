"""Turn Megascans boulder downloads (Fab, glTF "ue_raw", tier 0) into small web .glb files for the game.

python tools/scan-assets/prep.py            (needs Pillow; gltfpack via npx)

For each asset: keep the chosen variants, shrink the textures to TEX px, then gltfpack simplifies the
meshes to RATIO of their triangles and packs one .glb into client/assets/scan/. Positions stay
unquantized (-noq) so the game can lift the geometry straight into InstancedMesh. The source meshes are
Z-up, in centimetres - the game turns and scales them (render/boulders.js).
"""
import json, os, shutil, subprocess, sys
from PIL import Image

FAB = "D:/FabLibrary"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "../../client/assets/scan")
WORK = os.path.join(os.environ.get("TEMP", "/tmp"), "scan-assets-work")

# name: (download folder name, variants kept (None = all), simplify ratio, texture px, images used)
ASSETS = {
    "boulder-flat": ("tundra_boulder_vivvbcnaw", None, 0.002, 1024, "raw"),
    "boulder-mossy": ("tundra_mossy_boulder_vivveardw", None, 0.002, 1024, "raw"),
    "boulder-round": ("icelandic_boulder_tbpwp", None, 0.0012, 1024, "raw"),
    "boulder-erratic": ("nordic_boulder_vi2gecbmw", None, 0.0015, 1024, "raw"),
}


def find(name):
    for d in os.listdir(FAB):
        p = os.path.join(FAB, d, name + "_ue_raw_extracted")
        if os.path.isdir(p):
            return p
    raise FileNotFoundError(name)


def prep(key, folder, keep, ratio, px, kind):
    src = find(folder)
    gl = [f for f in os.listdir(os.path.join(src, "standard"))] if kind == "standard" and os.path.isdir(
        os.path.join(src, "standard")) else []
    gpath = os.path.join(src, "standard", gl[0]) if gl else next(
        os.path.join(src, f) for f in os.listdir(src) if f.endswith("_tier_0.gltf"))
    base = os.path.dirname(gpath)
    d = json.load(open(gpath))
    work = os.path.join(WORK, key)
    shutil.rmtree(work, ignore_errors=True)
    os.makedirs(work)
    # textures: smaller copies; colour with opacity stays PNG, the rest JPEG
    for img in d.get("images", []):
        im = Image.open(os.path.normpath(os.path.join(base, img["uri"])))
        k = px / max(im.size)
        im = im.resize((max(1, round(im.size[0] * k)), max(1, round(im.size[1] * k))), Image.LANCZOS)
        alpha = im.mode in ("RGBA", "LA") and "B-O" in img["uri"]
        name = os.path.splitext(os.path.basename(img["uri"]))[0].replace("_8K_", "_").replace("_4K_", "_")
        if alpha:
            name += ".png"; im.save(os.path.join(work, name))
            img["mimeType"] = "image/png"
        else:
            name += ".jpg"; im.convert("RGB").save(os.path.join(work, name), quality=88)
            img["mimeType"] = "image/jpeg"
        img["uri"] = name
        img.pop("extras", None)
    if len(d["buffers"]) != 1:
        sys.exit(f"{key}: expected one buffer, found {len(d['buffers'])}")
    for b in d["buffers"]:
        shutil.copy(os.path.normpath(os.path.join(base, b["uri"])), os.path.join(work, "mesh.bin"))
        b["uri"] = "mesh.bin"
    for m in d.get("materials", []):
        m.pop("extras", None)
        if m.get("alphaMode") != "MASK":
            m["doubleSided"] = False            # solid scans: back faces are never seen
    if keep:
        if any("children" in n for n in d["nodes"]):
            sys.exit(f"{key}: variant filter can't handle nested nodes")
        names = {i: m["name"] for i, m in enumerate(d["meshes"])}
        d["nodes"] = [n for n in d["nodes"] if "mesh" not in n or any(names[n["mesh"]].endswith(k) for k in keep)]
        for s in d["scenes"]:
            s["nodes"] = list(range(len(d["nodes"])))
    tmp = os.path.join(work, key + ".gltf")
    json.dump(d, open(tmp, "w"))
    os.makedirs(OUT, exist_ok=True)
    out = os.path.join(OUT, key + ".glb")
    # -sa: scans with many UV seams stop simplifying early (the erratic stayed at 41k triangles) without it
    subprocess.run(["npx", "--yes", "gltfpack@0.21.0", "-i", tmp, "-o", out, "-si", str(ratio), "-sa", "-noq", "-kn", "-km"],
                   check=True, shell=(os.name == "nt"))
    print(f"{key}: {os.path.getsize(out) // 1024} KB")


if __name__ == "__main__":
    for k, v in ASSETS.items():
        if len(sys.argv) < 2 or k in sys.argv[1:]:
            prep(k, *v)
