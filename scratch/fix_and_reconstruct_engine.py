import re

filepath = r"d:\Projects\workflow\js\engine.js"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# Normalize line endings to \n
content_norm = content.replace("\r\n", "\n")

# Collapse multiple consecutive blank lines to at most 1 blank line
content_clean = re.sub(r'\n{3,}', '\n\n', content_norm)

# Find the start of add_column:
# "// Add new column\n\n    add_column" or similar
add_col_pattern = re.compile(r'//\s*Add\s+new\s+column\s*\n\s*add_column', re.IGNORECASE)

if not add_col_pattern.search(content_clean):
    print("Error: Could not find add_column block in engine.js")
    exit(1)

# Let's insert const steps = { and async source(...) before add_column
steps_definition = """  // ── Step Executors ───────────────────────────────────────────

  const steps = {

    // Source nodes — build initial dataset
    async source(node, state, wf) {
      const subtype = node.config?.subtype || node.subtype || node.type;
      if (subtype === 'db') {
        const connectionString = node.config?.connectionString;
        const queryText = node.config?.query || node.config?.queryText;
        if (!connectionString || !queryText) {
          throw new Error('Database source configuration is missing connection string or query.');
        }
        // Extract host from connectionString to build Neon URL
        let host;
        const hostMatch = connectionString.match(/@([^/]+)/);
        if (hostMatch) {
          host = hostMatch[1];
        } else {
          throw new Error('Invalid connection string. Could not parse database host.');
        }
        const url = `https://${host}/sql`;
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Neon-Connection-String': connectionString
            },
            body: JSON.stringify({ query: queryText, params: [] })
          });
          if (!res.ok) {
            const errBody = await res.text();
            throw new Error(`HTTP error! status: ${res.status}, body: ${errBody}`);
          }
          const data = await res.json();
          if (data && data.rows && data.fields) {
            const columns = data.fields.map(f => f.name);
            const rows = data.rows;
            return { columns, rows };
          } else {
            throw new Error(data.message || 'Failed to fetch query results. Database response is invalid.');
          }
        } catch (e) {
          throw new Error(`Database query failed: ${e.message}`);
        }
      }

      if (node.config?.csvText) {
        const { columns, rows } = parseCSV(node.config.csvText);
        return { columns, rows };
      }
      if (node.config?.jsonText) {
        return parseJSON(node.config.jsonText);
      }
      // Use uploaded file data if available on workflow
      if (wf && wf._uploadedData) {
        return { columns: wf._uploadedData.columns, rows: wf._uploadedData.rows };
      }
      if (node.config?.sampleData && node.config?.columns) {
        const columns = node.config.columns;
        const rows = node.config.sampleData.map(r => {
          const row = {};
          columns.forEach((c, i) => row[c] = r[i] !== undefined ? r[i] : '');
          return row;
        });
        return { columns, rows };
      }
      // Generate minimal sample
      return {
        columns: ['ID', 'Name', 'DOB', 'Country', 'Phone', 'Amount'],
        rows: [
          { ID:'1', Name:'Alice',   DOB:'1990-05-12', Country:'India',   Phone:'+91-9876543210', Amount:'1200' },
          { ID:'2', Name:'Bob',     DOB:'1985-11-23', Country:'USA',     Phone:'+1-2025551234',  Amount:'3400' },
          { ID:'3', Name:'Carol',   DOB:'1992-03-08', Country:'Germany', Phone:'+91-8012345678', Amount:'2100' },
          { ID:'4', Name:'David',   DOB:'1978-07-30', Country:'India',   Phone:'+91-7712345678', Amount:'560'  },
          { ID:'5', Name:'Emma',    DOB:'1995-01-15', Country:'UK',      Phone:'+44-7912345678', Amount:'4200' },
        ],
      };
    },

"""

content_clean = add_col_pattern.sub(steps_definition + "// Add new column\n    add_column", content_clean)

# Now, let's find the run function and convert it to async.
# The run function starts with:
# "  function run(workflow) {"
run_pattern = re.compile(r'function run\(workflow\)\s*\{')
if not run_pattern.search(content_clean):
    print("Error: Could not find function run(workflow) in engine.js")
    exit(1)

content_clean = run_pattern.sub("async function run(workflow) {", content_clean)

# Inside the run function, we need to locate:
# "outState = executor(node, inputState, workflow) || inputState;"
# and change it to:
# "outState = (await executor(node, inputState, workflow)) || inputState;"
executor_pattern = re.compile(r'outState\s*=\s*executor\(node,\s*inputState,\s*workflow\)\s*\|\|\s*inputState;')
if not executor_pattern.search(content_clean):
    print("Error: Could not find executor call in run() function")
    exit(1)

content_clean = executor_pattern.sub("outState = (await executor(node, inputState, workflow)) || inputState;", content_clean)

# Save the final content back
with open(filepath, "w", encoding="utf-8") as f:
    f.write(content_clean)

print("Engine.js has been successfully updated and cleaned!")
