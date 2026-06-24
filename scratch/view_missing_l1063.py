with open(r"d:\Projects\workflow\js\engine.js.reconstructed", "r", encoding="utf-8") as f:
    lines = f.readlines()
    for i in range(1480, 1515):
        if i < len(lines):
            print(f"{i+1}: {lines[i].strip()}")
