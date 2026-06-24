import json
import re

log_path = r"C:\Users\DELL\.gemini\antigravity-ide\brain\ca37edce-3030-410e-9287-49d2af7c509a\.system_generated\logs\transcript.jsonl"

file_lines = {}

with open(log_path, 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        # Only take steps after 1161 and before 1337
        if 1162 <= i < 1337:
            if 'engine.js' in line:
                try:
                    obj = json.loads(line)
                    for key in ['content', 'output']:
                        val = obj.get(key, '')
                        if isinstance(val, str) and ('line number' in val or 'Showing lines' in val or 'evalFormula' in val):
                            for oline in val.split('\n'):
                                match = re.match(r'^\s*(\d+):\s*(.*)$', oline)
                                if match:
                                    lno = int(match.group(1))
                                    lcontent = match.group(2)
                                    file_lines[lno] = lcontent
                except Exception as e:
                    pass

print(f"Reconstructed {len(file_lines)} lines.")
if file_lines:
    max_line = max(file_lines.keys())
    print(f"Max line number: {max_line}")
    reconstructed = []
    for lno in range(1, max_line + 1):
        reconstructed.append(file_lines.get(lno, f"// MISSING LINE {lno}"))
        
    with open(r"d:\Projects\workflow\js\engine.js.reconstructed_perfect", "w", encoding="utf-8") as out:
        out.write("\n".join(reconstructed))
    print("Saved to d:\\Projects\\workflow\\js\\engine.js.reconstructed_perfect")
