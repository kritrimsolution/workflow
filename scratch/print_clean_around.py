import re

with open(r"d:\Projects\workflow\js\canvas.js", "r", encoding="utf-8") as f:
    text = f.read()

# Character-by-character scanner to get identical clean_chars list
clean_chars = []
i = 0
n = len(text)
state = 'code'
template_braces_stack = []

while i < n:
    ch = text[i]
    next_ch = text[i+1] if i + 1 < n else ''
    
    if state == 'code':
        if ch == '/' and next_ch == '/':
            state = 'line_comment'
            i += 2
        elif ch == '/' and next_ch == '*':
            state = 'block_comment'
            i += 2
        elif ch == '"':
            state = 'str_double'
            i += 1
        elif ch == "'":
            state = 'str_single'
            i += 1
        elif ch == '`':
            state = 'str_template'
            template_braces_stack.append(0)
            i += 1
        elif ch == '/' and not text[max(0, i-20):i].strip().endswith((')', ']', '}', 'this', 'true', 'false', 'null', 'NaN', 'undefined')):
            state = 'regex'
            i += 1
        else:
            clean_chars.append(ch)
            i += 1
    elif state == 'line_comment':
        if ch == '\n':
            state = 'code'
            clean_chars.append('\n')
        i += 1
    elif state == 'block_comment':
        if ch == '*' and next_ch == '/':
            state = 'code'
            i += 2
        else:
            i += 1
    elif state == 'str_double':
        if ch == '\\':
            i += 2
        elif ch == '"':
            state = 'code'
            i += 1
        else:
            i += 1
    elif state == 'str_single':
        if ch == '\\':
            i += 2
        elif ch == "'":
            state = 'code'
            i += 1
        else:
            i += 1
    elif state == 'regex':
        if ch == '\\':
            i += 2
        elif ch == '/':
            state = 'code'
            i += 1
        else:
            i += 1
    elif state == 'str_template':
        if ch == '\\':
            i += 2
        elif ch == '`':
            state = 'code'
            template_braces_stack.pop()
            i += 1
        elif ch == '$' and next_ch == '{':
            template_braces_stack[-1] += 1
            clean_chars.append('${')
            state = 'code'
            i += 2
        else:
            i += 1

clean_text = "".join(clean_chars)

# Print around 4300-4600
val = repr(clean_text[4300:4600])
print(val.encode('ascii', errors='replace').decode('ascii'))
