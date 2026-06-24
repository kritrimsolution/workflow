import os

path = r"d:\Projects\workflow\frontend\js\engine.js"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Locate function parsePrompt(text, columns = []) {
start_str = "  function parsePrompt(text, columns = []) {"
end_str = "  // ── Export helpers ────────────────────────────────────────────"

start_idx = content.find(start_str)
end_idx = content.find(end_str)

if start_idx == -1 or end_idx == -1:
    print("Error: Could not locate parsePrompt block boundaries!")
    print("start_idx:", start_idx, "end_idx:", end_idx)
    exit(1)

new_parse_prompt = """  async function parsePrompt(text, columns = []) {
    try {
      const res = await fetch('/api/parse-prompt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prompt: text, columns })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to compile prompt');
      }
      return await res.json();
    } catch (e) {
      console.error('Gemini prompt parsing failed:', e);
      if (window.UI && typeof window.UI.toast === 'function') {
        window.UI.toast(`Prompt failed: ${e.message}`, 'error');
      }
      return [];
    }
  }

"""

updated_content = content[:start_idx] + new_parse_prompt + content[end_idx:]

with open(path, "w", encoding="utf-8") as f:
    f.write(updated_content)

print("SUCCESS: parsePrompt replaced successfully!")
