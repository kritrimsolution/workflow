import re

with open(r"d:\Projects\workflow\js\canvas.js", "r", encoding="utf-8") as f:
    text = f.read()

# We will implement a character-by-character scanner to strip strings, comments, and regexes.
clean_chars = []
i = 0
n = len(text)
state = 'code' # code, line_comment, block_comment, str_single, str_double, str_template, regex
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
            # Guessing regex start (approximate but enough for syntax checking)
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
            # Enter code interpolation inside template literal
            template_braces_stack[-1] += 1
            clean_chars.append('${')
            state = 'code'
            i += 2
        else:
            i += 1

clean_text = "".join(clean_chars)

# Now, trace brackets in the clean_text
bracket_stack = []
for idx, ch in enumerate(clean_text):
    if ch in '([{':
        bracket_stack.append((ch, idx))
    elif ch in ')]}':
        if not bracket_stack:
            print(f"Extra closing bracket {ch} at clean-text index {idx}")
            continue
        last, last_idx = bracket_stack.pop()
        match = {')': '(', ']': '[', '}': '{'}[ch]
        if last != match:
            print(f"Mismatched bracket {ch} at clean-text index {idx}, matching {last} opened at {last_idx}")
            
# Find original line number for clean-text index
def get_original_line(clean_idx):
    # This is approximate but we can output a snippet from clean_text around it
    snippet = clean_text[max(0, clean_idx-50):min(len(clean_text), clean_idx+50)]
    return snippet

if bracket_stack:
    print(f"Total unclosed brackets: {len(bracket_stack)}")
    for b, idx in bracket_stack:
        print(f"Unclosed {b} at index {idx}: {repr(get_original_line(idx))}")
else:
    print("All brackets match!")
