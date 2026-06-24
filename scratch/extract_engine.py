import json

log_path = r"C:\Users\DELL\.gemini\antigravity-ide\brain\ca37edce-3030-410e-9287-49d2af7c509a\.system_generated\logs\transcript.jsonl"

found_contents = []

with open(log_path, 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        if 'engine.js' in line:
            try:
                obj = json.loads(line)
                # Check if it has viewed the file or output contains the file
                output = obj.get('output', '')
                if isinstance(output, str) and 'evalFormula' in output and len(output) > 20000:
                    found_contents.append((i, len(output), output))
            except Exception as e:
                pass

if found_contents:
    # Get the one with the maximum length (which is the full file view of 800+ lines or complete view)
    found_contents.sort(key=lambda x: x[1], reverse=True)
    idx, length, content = found_contents[0]
    print(f"Found candidate at step {idx} with length {length}")
    # Write to scratch/recovered_engine.js
    with open(r"d:\Projects\workflow\scratch\recovered_engine.js", "w", encoding="utf-8") as out:
        out.write(content)
    print("Saved to scratch/recovered_engine.js")
else:
    print("No large file views found in logs. Searching smaller ones...")
    # Let's search inside content or args
