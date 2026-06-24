import os
import subprocess

# Load new engine.js
path = r"d:\Projects\workflow\frontend\js\engine.js"
with open(path, "r", encoding="utf-8") as f:
    new_content = f.read()

# Get original parsePrompt from git index
orig_content = subprocess.check_output(["git", "show", "HEAD:js/engine.js"]).decode("utf-8")

# Extract parsePrompt from orig_content
start_str = "  function parsePrompt(text, columns = []) {"
end_str = "  // ── Export helpers ────────────────────────────────────────────"

start_idx = orig_content.find(start_str)
end_idx = orig_content.find(end_str)

if start_idx == -1 or end_idx == -1:
    print("Error: Could not locate original parsePrompt boundaries")
    exit(1)

original_parser_code = orig_content[start_idx:end_idx]

# Rename function to localRegexParsePrompt
original_parser_code = original_parser_code.replace(
    "  function parsePrompt(text, columns = []) {",
    "  function localRegexParsePrompt(text, columns = []) {"
)

# Insert localRegexParsePrompt just before Export helpers in new_content
insert_target = "  // ── Export helpers ────────────────────────────────────────────"
insert_idx = new_content.find(insert_target)

if insert_idx == -1:
    print("Error: Could not locate insert target in new engine.js")
    exit(1)

updated_content = new_content[:insert_idx] + original_parser_code + "\n\n" + new_content[insert_idx:]

with open(path, "w", encoding="utf-8") as f:
    f.write(updated_content)

print("SUCCESS: localRegexParsePrompt appended successfully!")
