import re

with open(r"d:\Projects\workflow\js\canvas.js", "r", encoding="utf-8") as f:
    text = f.read()

# Strip comments
text_clean = re.sub(r'/\*.*?\*/', '', text, flags=re.DOTALL)
text_clean = re.sub(r'//.*?\n', '\n', text_clean)

lines = text_clean.split('\n')
level = 0
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
                if i+1 > 1520:
                    safe_print = f"Line {i+1}, char {j}: Close string {string_char}".encode('ascii', errors='replace').decode('ascii')
                    print(safe_print)
                in_string = False
            j += 1
            continue
        if ch in ['"', "'", '`']:
            in_string = True
            string_char = ch
            if i+1 > 1520:
                safe_print = f"Line {i+1}, char {j}: Open string {string_char} | {line.strip()[:60]}".encode('ascii', errors='replace').decode('ascii')
                print(safe_print)
            j += 1
            continue
        if ch == '{':
            level += 1
        elif ch == '}':
            level -= 1
        j += 1

print(f"Final nesting level: {level}, in_string: {in_string}, string_char: {string_char}")
