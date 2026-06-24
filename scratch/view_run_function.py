with open(r"d:\Projects\workflow\js\engine.js.reconstructed", "r", encoding="utf-8") as f:
    lines = f.readlines()
    for i, line in enumerate(lines):
        if "function run(" in line:
            print(f"Line {i+1}: {line.strip()}")
            # Print next 130 lines to find where executor is called
            for j in range(i, i+130):
                if j < len(lines):
                    if "executor(" in lines[j] or "outState =" in lines[j]:
                        print(f"  Line {j+1}: {lines[j].strip()}")
