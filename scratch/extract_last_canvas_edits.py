import json

log_path = r"C:\Users\DELL\.gemini\antigravity-ide\brain\ca37edce-3030-410e-9287-49d2af7c509a\.system_generated\logs\transcript.jsonl"

with open(log_path, 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        if i >= 1290:
            if 'canvas.js' in line:
                try:
                    obj = json.loads(line)
                    for tool in obj.get('tool_calls', []):
                        name = tool.get('name')
                        if name in ['replace_file_content', 'multi_replace_file_content']:
                            args = tool.get('args', {})
                            print(f"Step {i}: Tool {name} (lines {args.get('StartLine')} - {args.get('EndLine')})")
                            print(f"  Target:\n{args.get('TargetContent')}")
                            print(f"  Replacement:\n{args.get('ReplacementContent')}")
                            print("-" * 50)
                except Exception as e:
                    pass
