import os
path = r"d:\Projects\workflow\js\engine.js.reconstructed"
if os.path.exists(path):
    with open(path, "r", encoding="utf-8") as f:
        lines = f.readlines()
        print("Lines count:", len(lines))
else:
    print("File does not exist")
