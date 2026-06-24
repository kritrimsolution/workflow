const fs = require('fs');
global.window = {};
const engineCode = fs.readFileSync('d:\\Projects\\workflow\\js\\engine.js.reconstructed', 'utf8');
eval(engineCode);
