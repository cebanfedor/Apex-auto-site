#!/usr/bin/env python3
"""Собирает server/epa-powertrain.js из vehicles.csv (EPA fueleconomy.gov, https://www.fueleconomy.gov/feg/epadata/vehicles.csv.zip).
Для каждой пары «марка|модель» хранит по годам, какие силовые установки бывают: G бензин/FFV, D дизель, H гибрид (EPA: Hybrid), P plug-in гибрид, E электро.
Используется как запасной источник (server/powertrain.js), когда VIN не расшифровался в NHTSA vPIC. Запуск: python3 scripts/build-epa-table.py /path/vehicles.csv"""
import csv, re, sys, json, collections
src = sys.argv[1] if len(sys.argv) > 1 else "vehicles.csv"
norm = lambda s: re.sub(r"[^a-z0-9]", "", s.lower())
MAKE_ALIAS = {"mercedesbenz": "mercedesbenz", "landrover": "landrover"}
d = collections.defaultdict(lambda: collections.defaultdict(set))
for r in csv.DictReader(open(src, encoding="utf-8")):
    y = int(r["year"])
    if y < 2010: continue
    t = r["atvType"]
    f = "H" if t == "Hybrid" else "P" if t == "Plug-in Hybrid" else "E" if t == "EV" else "D" if t == "Diesel" else "G"
    d[(norm(r["make"]), norm(r["baseModel"] or r["model"]))][y].add(f)
out = {}
for k, ys in d.items():
    if not any(("H" in s or "P" in s) for s in ys.values()): continue
    parts, prev, start = [], None, None
    for y in sorted(ys):
        fl = "".join(sorted(ys[y]))
        if prev is not None and prev[1] == fl and prev[0] == y - 1:
            prev = (y, fl); continue
        if prev is not None: parts.append((start, prev[0], prev[1]))
        start, prev = y, (y, fl)
    parts.append((start, prev[0], prev[1]))
    out["|".join(k)] = ",".join(f"{a}-{b}:{fl}" if a != b else f"{a}:{fl}" for a, b, fl in parts)
js = "// Сгенерировано scripts/build-epa-table.py из EPA fueleconomy.gov vehicles.csv — не править руками.\n// «марка|модель»: «годы:варианты» (G бензин/FFV, D дизель, H гибрид, P plug-in гибрид, E электро).\nmodule.exports = " + json.dumps(out, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + ";\n"
open("server/epa-powertrain.js", "w", encoding="utf-8").write(js)
print(len(out), "моделей,", len(js), "байт")
