import json

log_path = r"C:\Users\DELL\.gemini\antigravity-ide\brain\ca37edce-3030-410e-9287-49d2af7c509a\.system_generated\logs\transcript.jsonl"

with open(log_path, 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        if 'engine.js' in line:
            try:
                obj = json.loads(line)
                if obj.get('type') == 'VIEW_FILE' and obj.get('status') == 'DONE':
                    content = obj.get('content', '')
                    first_lines = []
                    for cl in content.split('\n')[:5]:
                        first_lines.append(cl)
                    print(f"Step {i}: content length {len(content)}, headers: {first_lines}")
            except Exception as e:
                pass
