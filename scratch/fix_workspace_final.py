import re

filepath = r"d:\Projects\workflow\js\engine.js"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# We look for:
# expr = expr.replace(/today\(\)/g, `"${new Date().toISOString().split('T')[0]}"`);
# and replace everything up to the next "// Add new column" with the correct closing of evalFormula.

pattern = re.compile(
    r'(expr\s*=\s*expr\.replace\(/today\\\(\\\)/g,\s*`"\$\{new Date\(\)\.toISOString\(\)\.split\(\'T\'\)\[0\]\}"`\);).*?(?=\s*//\s*Add\s+new\s+column)',
    re.DOTALL
)

replacement = r"""\1
    expr = expr.replace(/now\(\)/g, `"${new Date().toISOString()}"`);
    expr = expr.replace(/upper\(([^)]+)\)/g, (_, a) => `(${a}||"").toUpperCase()`);
    expr = expr.replace(/lower\(([^)]+)\)/g, (_, a) => `(${a}||"").toLowerCase()`);
    expr = expr.replace(/trim\(([^)]+)\)/g, (_, a) => `(${a}||"").trim()`);
    expr = expr.replace(/len\(([^)]+)\)/g, (_, a) => `(${a}||"").length`);

    try {
      // eslint-disable-next-line no-new-func
      return Function(`"use strict"; return (${expr})`)();
    } catch {
      return null;
    }
  }

"""

if pattern.search(content):
    new_content = pattern.sub(replacement, content)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(new_content)
    print("Match found and replaced!")
else:
    print("Regex match not found.")
