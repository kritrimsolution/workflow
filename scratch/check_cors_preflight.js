async function run() {
  const url = 'https://ep-dawn-forest-aidva6wp-pooler.c-4.us-east-1.aws.neon.tech/sql';
  try {
    // Simulate preflight request
    console.log("Sending OPTIONS preflight request...");
    const res = await fetch(url, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:8000',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,neon-connection-string'
      }
    });
    
    console.log("Status:", res.status);
    console.log("Headers:");
    for (const [key, val] of res.headers.entries()) {
      console.log(`  ${key}: ${val}`);
    }
  } catch (e) {
    console.error("OPTIONS request failed:", e);
  }
}
run();
