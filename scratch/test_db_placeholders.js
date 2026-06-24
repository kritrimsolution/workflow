const connectionString = 'postgresql://neondb_owner:npg_raOEb8sH5pfZ@ep-dawn-forest-aidva6wp-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const hostMatch = connectionString.match(/@([^/:]+)/);
const host = hostMatch ? hostMatch[1] : '';
const url = `https://${host}/sql`;

async function run() {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Neon-Connection-String': connectionString
      },
      body: JSON.stringify({
        query: 'SELECT * FROM users WHERE username = $1',
        params: ['admin']
      })
    });
    const data = await res.json();
    console.log("Placeholder Response:", JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Placeholder fetch failed:", e);
  }
}
run();
