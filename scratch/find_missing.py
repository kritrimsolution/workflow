with open(r"d:\Projects\workflow\js\engine.js.reconstructed", "r", encoding="utf-8") as f:
    for i, line in enumerate(f):
        if "MISSING LINE" in line:
            print(f"Line {i+1}: {line.strip()}")
