const fs = require('fs');

// Mock window object
global.window = {};

// Load engine.js code
const engineCode = fs.readFileSync('d:\\Projects\\workflow\\js\\engine.js', 'utf8');

// Evaluate engineCode in global scope
const sandbox = {};
const fn = new Function('sandbox', engineCode + '\nreturn Engine;');
const Engine = fn(sandbox);

// Define a workflow with a Postgres DB Source node
const workflow = {
  nodes: [
    {
      id: 'db1',
      type: 'source',
      subtype: 'db',
      label: 'Postgres DB Source',
      config: {
        connectionString: 'postgresql://neondb_owner:npg_raOEb8sH5pfZ@ep-dawn-forest-aidva6wp-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
        query: 'SELECT * FROM employees LIMIT 3'
      }
    },
    {
      id: 'add_col',
      type: 'transform',
      subtype: 'add_column',
      label: 'Add Calculate Column',
      config: {
        targetColumn: 'amount_plus_tax',
        formula: '{amount} * 1.18'
      }
    }
  ],
  edges: [
    { id: 'e1', from: 'db1', to: 'add_col' }
  ]
};

async function runTest() {
  console.log("Running DB integration test...");
  try {
    const result = await Engine.run(workflow);
    console.log("Result Success:", result.success);
    if (!result.success) {
      console.error("Errors:", result.errors);
      process.exit(1);
    }
    console.log("Columns:", result.state.columns);
    console.log("Fetched rows count:", result.state.rows.length);
    console.log("Sample row:", result.state.rows[0]);
    
    // Assert we got records
    if (result.state.rows.length > 0 && result.state.columns.includes('amount_plus_tax')) {
      console.log("SUCCESS! DB Integration works perfectly!");
      process.exit(0);
    } else {
      console.error("FAIL: Did not get records or formula column missing!");
      process.exit(1);
    }
  } catch (e) {
    console.error("Test failed to execute:", e);
    process.exit(1);
  }
}

runTest();
