import json

log_path = r"C:\Users\DELL\.gemini\antigravity-ide\brain\ca37edce-3030-410e-9287-49d2af7c509a\.system_generated\logs\transcript.jsonl"

with open(log_path, 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        if i == 1150:
            try:
                obj = json.loads(line)
                for tool in obj.get('tool_calls', []):
                    args = tool.get('args', {})
                    t = args.get('TargetContent', '')
                    r = args.get('ReplacementContent', '')
                    print("Target:")
                    print(t.encode('ascii', errors='replace').decode('ascii'))
                    print("="*50)
                    print("Replacement:")
                    print(r.encode('ascii', errors='replace').decode('ascii'))
            except Exception as e:
                print("Error:", e)
