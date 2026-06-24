with open(r"d:\Projects\workflow\js\canvas.js", "r", encoding="utf-8") as f:
    lines = f.readlines()

sub_lines = lines[1390:1995] # 0-indexed: lines 1391 to 1995
text = "".join(sub_lines)

# Count braces ignoring comments and strings
level = 0
in_string = False
string_char = None
escaped = False

i = 0
n = len(text)
while i < n:
    ch = text[i]
    if escaped:
        escaped = False
        i += 1
        continue
    if ch == '\\':
        escaped = True
        i += 1
        continue
    if in_string:
        if ch == string_char:
            in_string = False
        i += 1
        continue
    if ch in ['"', "'", '`']:
        in_string = True
        string_char = ch
        i += 1
        continue
    if ch == '{':
        level += 1
    elif ch == '}':
        level -= 1
        if level < 0:
            print(f"Brace closed below 0 at character {i}!")
    i += 1

print(f"End level of _onFormulaHelperChange: {level}")
