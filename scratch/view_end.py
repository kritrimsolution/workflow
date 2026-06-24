with open(r"d:\Projects\workflow\js\engine.js.reconstructed", "r", encoding="utf-8") as f:
    lines = f.readlines()
    print("Total lines:", len(lines))
    for i in range(max(0, len(lines)-100), len(lines)):
        print(f"{i+1}: {lines[i].strip()}")
