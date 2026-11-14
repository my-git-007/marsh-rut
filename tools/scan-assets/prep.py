"""Turn Megascans boulder, log and stump downloads (Fab, glTF "ue_raw", tier 0) into small web .glb files for the game.

python tools/scan-assets/prep.py            (needs Pillow; gltfpack via npx)

For each asset: keep the chosen variants, shrink the textures to TEX px, then gltfpack simplifies the
meshes to RATIO of their triangles and packs one .glb into client/assets/scan/. Positions stay
unquantized (-noq) so the game can lift the geometry straight into InstancedMesh. The source meshes are
Z-up, in centimetres - the game turns and scales them (render/boulders.js, render/deadwood.js).

The logs and stumps also get a light far-away copy (<name>-far.glb: the shape only, with the texture
coordinates and tangents - see below - so it can wear the near model's material). Thin wood tears apart under gltfpack's
aggressive mode (-sa), so the near model is simplified without it; the far one needs it to get small, and is only
seen from far enough away that the tears don't show.
"""
import json, os, shutil, subprocess, sys
from PIL import Image

FAB = "D:/FabLibrary"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "../../client/assets/scan")
WORK = os.path.join(os.environ.get("TEMP", "/tmp"), "scan-assets-work")

# name: (download folder name, variants kept (None = all), simplify ratio, texture px, images used[, far ratio])
ASSETS = {
    "boulder-flat": ("tundra_boulder_vivvbcnaw", None, 0.002, 1024, "raw"),
    "boulder-mossy": ("tundra_mossy_boulder_vivveardw", None, 0.002, 1024, "raw"),
    "boulder-round": ("icelandic_boulder_tbpwp", None, 0.0012, 1024, "raw"),
    "boulder-erratic": ("nordic_boulder_vi2gecbmw", None, 0.0015, 1024, "raw"),
    # deadwood: spruce logs, trees blown over with their root plates, stumps
    "log-spruce-big": ("nordic_forest_tree_log_large_xicjcacr", None, 0.012, 1024, "raw", 0.003),
    "log-spruce": ("nordic_forest_tree_log_small_xiclcfl", None, 0.012, 1024, "raw", 0.003),
    "log-uprooted": ("nordic_forest_tree_uprooted_medium_xiciaat", None, 0.012, 1024, "raw", 0.003),
    "log-uprooted-small": ("nordic_forest_tree_uprooted_small_xiejeio", None, 0.012, 1024, "raw", 0.003),
    "stump-mossy": ("mossy_tree_stump_qdyf7", None, 0.012, 1024, "raw", 0.003),
    "stump-rotten": ("rotten_tree_stump_whnpaed", None, 0.012, 1024, "raw", 0.003),
    "stump-low": ("old_tree_stump_wd0qcaobw", None, 0.012, 1024, "raw", 0.003),
    "stump-tall": ("tree_stump_qegv3", None, 0.012, 1024, "raw", 0.003),
    "stump-broken": ("forest_american_tree_stump_wood_large_wj0sfins", None, 0.012, 1024, "raw", 0.003),
}


def find(name):
    for d in os.listdir(FAB):
        p = os.path.join(FAB, d, name + "_ue_raw_extracted")
        if os.path.isdir(p):
            return p
    raise FileNotFoundError(name)


def prep(key, folder, keep, ratio, px, kind, far=None):
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
    # only the images a material uses (the scans also carry a feather/opacity map nothing reads)
    used = set()
    for m in d.get("materials", []):
        for t in [m.get("normalTexture"), m.get("occlusionTexture"), m.get("emissiveTexture"),
                  *(m.get("pbrMetallicRoughness", {}).get(k) for k in ("baseColorTexture", "metallicRoughnessTexture"))]:
            if t:
                used.add(d["textures"][t["index"]]["source"])
    # textures: smaller copies; colour with opacity stays PNG, the rest JPEG
    for i, img in enumerate(d.get("images", [])):
        if i not in used:
            continue
        im = Image.open(os.path.normpath(os.path.join(base, img["uri"])))
        # (the roughness/occlusion map at half size: it's soft, and nobody sees the difference)
        k = (px // 2 if far and "ORM" in img["uri"] else px) / max(im.size)
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
    aggr = [] if far else ["-sa"]
    subprocess.run(["npx", "--yes", "gltfpack@0.21.0", "-i", tmp, "-o", out, "-si", str(ratio), *aggr, "-noq", "-kn", "-km"],
                   check=True, shell=(os.name == "nt"))
    print(f"{key}: {os.path.getsize(out) // 1024} KB")
    if far:
        # (its images are 4 px stand-ins: the game puts the near model's material on it, but the material has to
        # stay or gltfpack drops the texture coordinates and tangents that material needs)
        for img in d.get("images", []):
            if os.path.exists(os.path.join(work, img["uri"])):
                Image.open(os.path.join(work, img["uri"])).resize((4, 4)).convert("RGB").save(os.path.join(work, img["uri"]))
        json.dump(d, open(tmp, "w"))
        out = os.path.join(OUT, key + "-far.glb")
        subprocess.run(["npx", "--yes", "gltfpack@0.21.0", "-i", tmp, "-o", out, "-si", str(far), "-sa", "-noq", "-kn", "-km"],
                       check=True, shell=(os.name == "nt"))
        print(f"{key}-far: {os.path.getsize(out) // 1024} KB")


if __name__ == "__main__":
    for k, v in ASSETS.items():
        if len(sys.argv) < 2 or k in sys.argv[1:]:
            prep(k, *v)
