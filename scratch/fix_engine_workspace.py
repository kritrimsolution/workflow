with open(r"d:\Projects\workflow\js\engine.js", "r", encoding="utf-8") as f:
    content = f.read()

target = """          { ID:'5', Name:'Emma',    DOB:'1995-01-15', Country:'UK',      Phone:'+44-7912345678', Amount:'4200' },

        ],

      };

    },"""

replacement = """    expr = expr.replace(/now\(\)/g, `"${new Date().toISOString()}"`);
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
  }"""

if target in content:
    content = content.replace(target, replacement)
    with open(r"d:\Projects\workflow\js\engine.js", "w", encoding="utf-8") as f:
        f.write(content)
    print("Successfully replaced!")
else:
    # Try with different carriage return / spacing formats if not matched exactly
    print("Target content not found exactly. Let's normalize newlines.")
    target_norm = target.replace('\r\n', '\n').replace('\r', '\n')
    content_norm = content.replace('\r\n', '\n').replace('\r', '\n')
    if target_norm in content_norm:
        content_norm = content_norm.replace(target_norm, replacement)
        with open(r"d:\Projects\workflow\js\engine.js", "w", encoding="utf-8") as f:
            f.write(content_norm)
        print("Successfully replaced with normalized newlines!")
    else:
        print("Failed to find target content even with normalization.")
