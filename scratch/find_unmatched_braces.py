import re

with open(r"d:\Projects\workflow\js\canvas.js", "r", encoding="utf-8") as f:
    text = f.read()

# Strip multi-line comments
text_clean = re.sub(r'/\*.*?\*/', '', text, flags=re.DOTALL)
# Strip single-line comments
text_clean = re.sub(r'//.*?\n', '\n', text_clean)

lines = text_clean.split('\n')
stack = []
in_string = False
string_char = None
escaped = False

for i, line in enumerate(lines):
    j = 0
    while j < len(line):
        ch = line[j]
        if escaped:
            escaped = False
            j += 1
            continue
        if ch == '\\':
            escaped = True
            j += 1
            continue
        if in_string:
            if ch == string_char:
                in_string = False
            j += 1
            continue
        if ch in ['"', "'", '`']:
            in_string = True
            string_char = ch
            j += 1
            continue
        if ch == '{':
            stack.append((i+1, line.strip()))
        elif ch == '}':
            if stack:
                stack.pop()
            else:
                print(f"Extra closing brace at line {i+1}: {line.strip()}")
        j += 1

if stack:
    print(f"Total unclosed braces: {len(stack)}")
    for lno, content in stack[-10:]:
        print(f"Unclosed brace opened at line {lno}: {content[:80]}")
else:
    print("All braces matched.")
