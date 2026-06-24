import json

log_path = r"C:\Users\DELL\.gemini\antigravity-ide\brain\ca37edce-3030-410e-9287-49d2af7c509a\.system_generated\logs\transcript.jsonl"

with open(log_path, 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        if 'canvas.js' in line:
            try:
                obj = json.loads(line)
                for tool in obj.get('tool_calls', []):
                    name = tool.get('name')
                    if name in ['replace_file_content', 'write_to_file', 'multi_replace_file_content']:
                        args = tool.get('args', {})
                        target = args.get('TargetFile', '')
                        if 'canvas.js' in target:
                            print(f"Step {i}: Tool {name}")
                            if name == 'replace_file_content':
                                print(f"  Start: {args.get('StartLine')}, End: {args.get('EndLine')}")
                                print(f"  Target: {repr(args.get('TargetContent')[:150])}")
                                print(f"  Replacement: {repr(args.get('ReplacementContent')[:150])}")
            except Exception as e:
                pass
