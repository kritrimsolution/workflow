import sys
sys.stdout.reconfigure(encoding='utf-8')

with open(r"d:\Projects\workflow\js\engine.js.reconstructed", "r", encoding="utf-8") as f:
    lines = f.readlines()
    for i in range(0, min(len(lines), 125)):
        print(f"{i+1}: {lines[i].strip()}")
