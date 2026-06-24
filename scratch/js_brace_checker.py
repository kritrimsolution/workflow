import re

with open(r"d:\Projects\workflow\js\canvas.js", "r", encoding="utf-8") as f:
    text = f.read()

# Let's clean text of comments first
def strip_comments(s):
    def repl_block(m):
        return ' ' * len(m.group(0))
    s = re.sub(r'/\*.*?\*/', repl_block, s, flags=re.DOTALL)
    
    def repl_line(m):
        return ' ' * (len(m.group(0)) - 1) + '\n'
    s = re.compile(r'//[^\n]*').sub(repl_line, s)
    return s

text_no_comments = strip_comments(text)

i = 0
n = len(text_no_comments)
state_stack = ['code'] # code, str_single, str_double, str_template
template_brace_levels = [] # nesting levels of braces inside template interpolation
braces_stack = [] # holds (line_no, col_no, char_idx) of open '{'
parens_stack = [] # holds (line_no, col_no, char_idx) of open '('

line_no = 1
col_no = 1

while i < n:
    ch = text_no_comments[i]
    
    if ch == '\n':
        next_line = line_no + 1
        next_col = 1
    else:
        next_line = line_no
        next_col = col_no + 1
        
    current_state = state_stack[-1]
    
    if current_state == 'code':
        if ch == '"':
            state_stack.append('str_double')
        elif ch == "'":
            state_stack.append('str_single')
        elif ch == '`':
            state_stack.append('str_template')
            template_brace_levels.append(0)
        elif ch == '{':
            braces_stack.append((line_no, col_no, i))
            if template_brace_levels:
                template_brace_levels[-1] += 1
        elif ch == '}':
            if template_brace_levels and template_brace_levels[-1] > 0:
                template_brace_levels[-1] -= 1
                if braces_stack:
                    braces_stack.pop()
            elif template_brace_levels and template_brace_levels[-1] == 0:
                # Exit template interpolation!
                state_stack.pop()
                try:
                    template_brace_levels.pop()
                except IndexError:
                    print(f"IndexError pop template_brace_levels at Line {line_no}, Col {col_no} (exit interpolation)")
                if braces_stack:
                    braces_stack.pop()
            else:
                if braces_stack:
                    braces_stack.pop()
                else:
                    print(f"Extra '}}' found at Line {line_no}, Col {col_no}")
        elif ch == '(':
            parens_stack.append((line_no, col_no, i))
        elif ch == ')':
            if parens_stack:
                parens_stack.pop()
            else:
                print(f"Extra ')' found at Line {line_no}, Col {col_no}")
                
    elif current_state == 'str_double':
        if ch == '\\':
            i += 1
        elif ch == '"':
            state_stack.pop()
            
    elif current_state == 'str_single':
        if ch == '\\':
            i += 1
        elif ch == "'":
            state_stack.pop()
            
    elif current_state == 'str_template':
        if ch == '\\':
            i += 1
        elif ch == '`':
            state_stack.pop()
            try:
                template_brace_levels.pop()
            except IndexError:
                print(f"IndexError pop template_brace_levels at Line {line_no}, Col {col_no} (backtick close)")
        elif ch == '$' and i + 1 < n and text_no_comments[i+1] == '{':
            state_stack.append('code')
            braces_stack.append((line_no, col_no, i))
            i += 1
            
    i += 1
    line_no = next_line
    col_no = next_col

print(f"End scanning. State stack: {state_stack}")
if braces_stack:
    print(f"Unclosed curly braces: {len(braces_stack)}")
    for l, c, idx in braces_stack[-5:]:
        # safe print
        safe_snippet = text[idx:idx+40].encode('ascii', errors='replace').decode('ascii')
        print(f"  Line {l}, Col {c}: {repr(safe_snippet)}")
if parens_stack:
    print(f"Unclosed parentheses: {len(parens_stack)}")
    for l, c, idx in parens_stack[-5:]:
        safe_snippet = text[idx:idx+40].encode('ascii', errors='replace').decode('ascii')
        print(f"  Line {l}, Col {c}: {repr(safe_snippet)}")
