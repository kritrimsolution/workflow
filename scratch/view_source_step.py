import sys

# Set standard output encoding to utf-8
sys.stdout.reconfigure(encoding='utf-8')

with open(r"d:\Projects\workflow\js\engine.js.reconstructed", "r", encoding="utf-8") as f:
    lines = f.readlines()
    for i, line in enumerate(lines):
        if "const steps = {" in line or "source(node" in line:
            print(f"Line {i+1}: {line.strip()}")
            for j in range(i-5, i+40):
                if j < len(lines):
                    print(f"  {j+1}: {lines[j].strip()}")
