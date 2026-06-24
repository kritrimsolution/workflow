import json
import re

log_path = r"C:\Users\DELL\.gemini\antigravity-ide\brain\ca37edce-3030-410e-9287-49d2af7c509a\.system_generated\logs\transcript.jsonl"

steps_to_view = [901, 903, 905, 907]
with open(log_path, 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        if i in steps_to_view:
            try:
                obj = json.loads(line)
                print(f"--- STEP {i} ---")
                content = obj.get('content', '')
                print(content[:1000])
            except Exception as e:
                pass
