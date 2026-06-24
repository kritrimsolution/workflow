with open(r"d:\Projects\workflow\js\canvas.js", "r", encoding="utf-8") as f:
    text = f.read()

start_idx = text.find("document.getElementById('app-root').innerHTML = `")
if start_idx == -1:
    print("Could not find start of innerHTML template")
    exit(1)

# Start scanning from start_idx + len("document.getElementById('app-root').innerHTML = `")
i = start_idx + len("document.getElementById('app-root').innerHTML = `")
n = len(text)
escaped = False
nest_braces = []

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
    if ch == '`':
        # Found the closing backtick!
        print(f"Closing backtick found at char index {i}. Line: {text[:i].count('\n') + 1}")
        print("Ending context:")
        print(text[i-150:i+100])
        break
    elif ch == '$' and text[i+1] == '{':
        nest_braces.append(i)
        i += 2
        # Now we need to parse JS inside the interpolation!
        # Scan until matching }
        brace_level = 1
        in_s = False
        s_char = None
        esc = False
        i_code = i
        while i_code < n:
            c_ch = text[i_code]
            if esc:
                esc = False
                i_code += 1
                continue
            if c_ch == '\\':
                esc = True
                i_code += 1
                continue
            if in_s:
                if c_ch == s_char:
                    in_s = False
                i_code += 1
                continue
            if c_ch in ['"', "'"]:
                in_s = True
                s_char = c_ch
                i_code += 1
                continue
            if c_ch == '{':
                brace_level += 1
            elif c_ch == '}':
                brace_level -= 1
                if brace_level == 0:
                    i = i_code + 1
                    nest_braces.pop()
                    break
            i_code += 1
    else:
        i += 1
