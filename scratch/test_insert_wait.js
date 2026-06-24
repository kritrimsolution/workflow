const connectionString = 'postgresql://neondb_owner:npg_raOEb8sH5pfZ@ep-dawn-forest-aidva6wp-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const hostMatch = connectionString.match(/@([^/:]+)/);
const host = hostMatch ? hostMatch[1] : '';
const url = `https://${host}/sql`;

async function run() {
  try {
    const wf = {
      id: 'wf_' + Date.now().toString(36),
      name: 'Persisted Demo Workflow',
      description: 'Demo description',
      nodes: '[]',
      edges: '[]',
      node_positions: '{}',
      published: false,
      share_token: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      run_count: 0,
      last_run: null,
      status: 'draft',
      uploaded_data: null
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Neon-Connection-String': connectionString
      },
      body: JSON.stringify({
        query: `
          INSERT INTO workflows (id, name, description, nodes, edges, node_positions, published, share_token, created_at, updated_at, run_count, last_run, status, uploaded_data)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        `,
        params: [
          wf.id, wf.name, wf.description, wf.nodes, wf.edges, wf.node_positions,
          wf.published, wf.share_token, wf.created_at, wf.updated_at, wf.run_count,
          wf.last_run, wf.status, wf.uploaded_data
        ]
      })
    });
    const data = await res.json();
    console.log("Insert Response:", JSON.stringify(data, null, 2));

    // Now select it
    const selectRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Neon-Connection-String': connectionString
      },
      body: JSON.stringify({
        query: 'SELECT id, name FROM workflows WHERE id = $1',
        params: [wf.id]
      })
    });
    const selectData = await selectRes.json();
    console.log("Select Response:", JSON.stringify(selectData, null, 2));
  } catch (e) {
    console.error("Error:", e);
  }
}
run();
