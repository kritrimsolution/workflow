const fs = require('fs');
global.window = {};
try {
  const engineCode = fs.readFileSync('d:\\Projects\\workflow\\js\\engine.js.reconstructed', 'utf8');
  const fn = new Function('sandbox', engineCode + '\nreturn Engine;');
  const Engine = fn({});
  console.log("Success! Engine loaded.");
} catch (e) {
  console.error("Error loading engine:", e);
}
