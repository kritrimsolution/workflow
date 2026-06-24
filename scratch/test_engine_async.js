const fs = require('fs');

// Mock window object
global.window = {};

// Load engine.js code
const engineCode = fs.readFileSync('d:\\Projects\\workflow\\js\\engine.js', 'utf8');

// Evaluate engineCode in global scope
const sandbox = {};
const fn = new Function('sandbox', engineCode + '\nreturn Engine;');
const Engine = fn(sandbox);

// Define a mock workflow
const workflow = {
  nodes: [
    { id: 'n1', type: 'source', subtype: 'csv', label: 'CSV Source', config: { csvText: 'ID,AGE,SEX\n1,63,Male\n2,67,Male' } },
    { id: 'n2', type: 'transform', subtype: 'rename_column', label: 'Rename Column', config: { renames: { SEX: 'GENDER' } } },
    { id: 'n3', type: 'output', subtype: 'csv', label: 'CSV Export', config: {} }
  ],
  edges: [
    { id: 'e1', from: 'n1', to: 'n2' },
    { id: 'e2', from: 'n2', to: 'n3' }
  ]
};

async function test() {
  try {
    const result = await Engine.run(workflow);
    console.log('Result Success:', result.success);
    console.log('Result State Columns:', result.state.columns);
    console.log('Result State Rows:', result.state.rows);
    console.log('Errors:', result.errors);
  } catch (err) {
    console.error('Test error:', err);
  }
}
test();
