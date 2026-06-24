import json

log_path = r"C:\Users\DELL\.gemini\antigravity-ide\brain\ca37edce-3030-410e-9287-49d2af7c509a\.system_generated\logs\transcript.jsonl"

with open(log_path, 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        if 'evalFormula' in line:
            try:
                obj = json.loads(line)
                # print type and index
                print(f"Step {i}: Type: {obj.get('type')}, Status: {obj.get('status')}")
                # Search inside content or tool_calls
                content = obj.get('content', '')
                if 'evalFormula' in content:
                    print(f"--- CONTENT (length {len(content)}) ---")
                    print(content[:1000])
                    print("...")
                
                # Check tool calls / tool output
                for tool in obj.get('tool_calls', []):
                    args = json.dumps(tool.get('args', {}))
                    if 'evalFormula' in args:
                        print(f"--- TOOL CALL {tool.get('name')} ARGS ---")
                        print(args[:1000])
                        print("...")
                
                # Check results
                output = obj.get('output', '')
                if isinstance(output, str) and 'evalFormula' in output:
                    print(f"--- OUTPUT (length {len(output)}) ---")
                    # Find index of evalFormula and print around it
                    idx = output.find('evalFormula')
                    start = max(0, idx - 500)
                    end = min(len(output), idx + 2500)
                    print(output[start:end])
                    print("...")
            except Exception as e:
                print(f"Error parsing line {i}: {e}")
