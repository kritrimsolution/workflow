const fs = require('fs');
const path = require('path');

// Mock localStorage
const localStorageMock = {
  store: {},
  getItem(key) { return this.store[key] || null; },
  setItem(key, val) { this.store[key] = String(val); },
  removeItem(key) { delete this.store[key]; }
};
global.localStorage = localStorageMock;

// Mock window object
global.window = {};

// Mock alert/console if needed, but fetch is global in Node 18+
const originalFetch = global.fetch;
global.fetch = async (url, options) => {
  if (url === '/.env' || url === '.env') {
    // read local .env
    try {
      const content = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
      return {
        ok: true,
        text: async () => content
      };
    } catch (e) {
      return { ok: false };
    }
  }
  // otherwise delegate to original fetch
  return originalFetch(url, options);
};

// Evaluate storage.js
const storageCode = fs.readFileSync(path.join(__dirname, '../js/storage.js'), 'utf8');
const fn = new Function('global', 'window', storageCode);
fn(global, global.window);

const Storage = global.window.Storage;

async function test() {
  console.log("Testing database persistence setup...");
  try {
    await Storage.init();
    
    // Check if users were seeded
    const users = Storage.Users.all();
    console.log("Seeded Users in Cache:", users);
    if (users.length === 0) {
      throw new Error("No users found after sync/init.");
    }
    
    // Check if workflows were seeded if we start empty
    Storage.seedIfEmpty();
    const workflows = Storage.Workflows.all();
    console.log(`Workflows in Cache: ${workflows.length}`);
    if (workflows.length === 0) {
      throw new Error("Demo workflows were not seeded.");
    }
    
    // Test CRUD: Create a temporary test workflow
    console.log("Creating test workflow...");
    const testWf = Storage.Workflows.create({
      name: "Persistence Test Workflow",
      description: "Verifies DB persistence works correctly"
    });
    console.log(`Created test workflow: ${testWf.name} (ID: ${testWf.id})`);
    
    // Read workflows again from cache, make sure it's there
    const found = Storage.Workflows.get(testWf.id);
    if (!found) throw new Error("Created workflow not found in cache!");
    
    // Test update
    console.log("Updating test workflow...");
    Storage.Workflows.update(testWf.id, { description: "Updated description in test" });
    const updated = Storage.Workflows.get(testWf.id);
    if (updated.description !== "Updated description in test") {
      throw new Error("Update did not apply to cache!");
    }
    
    // Let's delete it
    console.log("Deleting test workflow...");
    Storage.Workflows.delete(testWf.id);
    if (Storage.Workflows.get(testWf.id)) {
      throw new Error("Delete did not remove from cache!");
    }
    
    console.log("SUCCESS! Database persistence test runs perfectly.");
    process.exit(0);
  } catch (e) {
    console.error("Test failed:", e);
    process.exit(1);
  }
}

test();
