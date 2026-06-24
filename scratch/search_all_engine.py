import json

log_path = r"C:\Users\DELL\.gemini\antigravity-ide\brain\ca37edce-3030-410e-9287-49d2af7c509a\.system_generated\logs\transcript.jsonl"

with open(log_path, 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        if 'engine.js' in line:
            try:
                obj = json.loads(line)
                print(f"Step {i}: {obj.get('type')} / {obj.get('status')}")
                if 'output' in obj and isinstance(obj['output'], str):
                    print(f"  output length: {len(obj['output'])}")
                if 'content' in obj and isinstance(obj['content'], str):
                    print(f"  content length: {len(obj['content'])}")
            except Exception as e:
                pass
