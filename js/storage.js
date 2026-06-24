/* ================================================================
   storage.js — Sync-through PostgreSQL & localStorage cache storage
   ================================================================ */

const Storage = (() => {
  const KEYS = {
    WORKFLOWS: 'wf_workflows',
    LOGS: 'wf_run_logs',
    SESSION: 'wf_session',
  };

  const dbConfig = {
    connectionString: '',
    url: ''
  };

  // ── Environment & DB Core ─────────────────────────────────────
  async function loadEnv() {
    try {
      const response = await fetch('/.env');
      if (!response.ok) {
        const response2 = await fetch('.env');
        if (!response2.ok) throw new Error('Failed to fetch .env');
        return parseEnv(await response2.text());
      }
      return parseEnv(await response.text());
    } catch (e) {
      console.warn('Could not load .env file, using defaults:', e);
      return {};
    }
  }

  function parseEnv(text) {
    const env = {};
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.substring(0, idx).trim();
      let val = trimmed.substring(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.substring(1, val.length - 1);
      }
      env[key] = val;
    }
    return env;
  }

  async function dbQuery(sql, params = []) {
    if (!dbConfig.connectionString) {
      throw new Error('Database connection string is empty.');
    }
    const res = await fetch(dbConfig.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Neon-Connection-String': dbConfig.connectionString
      },
      body: JSON.stringify({ query: sql, params })
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Database query failed: ${errText}`);
    }
    return await res.json();
  }

  function bgQuery(sql, params = []) {
    dbQuery(sql, params).catch(err => {
      console.error('Background DB write failed for query:', sql, 'Error:', err);
      if (window.UI && typeof window.UI.toast === 'function') {
        window.UI.toast(`Database save failed: ${err.message}`, 'error');
      }
    });
  }

  // ── Database to JS Mappers ───────────────────────────────────
  function dbRowToWorkflow(row) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      nodes: row.nodes ? JSON.parse(row.nodes) : [],
      edges: row.edges ? JSON.parse(row.edges) : [],
      nodePositions: row.node_positions ? JSON.parse(row.node_positions) : {},
      published: !!row.published,
      shareToken: row.share_token,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      runCount: parseInt(row.run_count || 0, 10),
      lastRun: row.last_run,
      status: row.status,
      uploadedData: row.uploaded_data ? JSON.parse(row.uploaded_data) : null
    };
  }

  function workflowToDbRow(wf) {
    return {
      id: wf.id,
      name: wf.name || 'Untitled Workflow',
      description: wf.description || '',
      nodes: JSON.stringify(wf.nodes || []),
      edges: JSON.stringify(wf.edges || []),
      node_positions: JSON.stringify(wf.nodePositions || {}),
      published: !!wf.published,
      share_token: wf.shareToken || null,
      created_at: wf.createdAt,
      updated_at: wf.updatedAt,
      run_count: wf.runCount || 0,
      last_run: wf.lastRun || null,
      status: wf.status || 'draft',
      uploaded_data: wf.uploadedData ? JSON.stringify(wf.uploadedData) : null
    };
  }

  function dbRowToLog(row) {
    return {
      id: row.id,
      workflowId: row.workflow_id,
      status: row.status,
      startTime: row.start_time,
      durationMs: parseInt(row.duration_ms || 0, 10),
      outputRows: parseInt(row.output_rows || 0, 10),
      error: row.error
    };
  }

  function dbRowToUser(row) {
    return {
      username: row.username,
      password: row.password,
      role: row.role,
      displayName: row.display_name
    };
  }

  // ── Database Initialization ──────────────────────────────────
  async function init() {
    const env = await loadEnv();
    window.env = env;

    const dbUrl = env.DATABASE_URL || 'postgresql://neondb_owner:npg_raOEb8sH5pfZ@ep-dawn-forest-aidva6wp-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
    dbConfig.connectionString = dbUrl;
    const hostMatch = dbUrl.match(/@([^/:]+)/);
    const host = hostMatch ? hostMatch[1] : '';
    dbConfig.url = `https://${host}/sql`;

    try {
      console.log('Initializing database tables...');
      await dbQuery(`
        CREATE TABLE IF NOT EXISTS users (
          username VARCHAR(50) PRIMARY KEY,
          password VARCHAR(100),
          role VARCHAR(50),
          display_name VARCHAR(100)
        )
      `);

      await dbQuery(`
        CREATE TABLE IF NOT EXISTS workflows (
          id VARCHAR(50) PRIMARY KEY,
          name VARCHAR(255),
          description TEXT,
          nodes TEXT,
          edges TEXT,
          node_positions TEXT,
          published BOOLEAN,
          share_token VARCHAR(255),
          created_at VARCHAR(50),
          updated_at VARCHAR(50),
          run_count INTEGER,
          last_run VARCHAR(50),
          status VARCHAR(50),
          uploaded_data TEXT
        )
      `);

      await dbQuery(`
        CREATE TABLE IF NOT EXISTS run_logs (
          id VARCHAR(50) PRIMARY KEY,
          workflow_id VARCHAR(50),
          status VARCHAR(50),
          start_time VARCHAR(50),
          duration_ms INTEGER,
          output_rows INTEGER,
          error TEXT
        )
      `);

      // Seed default users if empty
      const usersCheck = await dbQuery('SELECT COUNT(*) FROM users');
      const usersCount = parseInt(usersCheck.rows[0].count, 10);
      if (usersCount === 0) {
        console.log('Seeding default users...');
        await dbQuery(`
          INSERT INTO users (username, password, role, display_name) VALUES
          ('admin', 'admin123', 'admin', 'Admin'),
          ('user', 'user123', 'user', 'Viewer')
        `);
      }

      // Fetch all data from DB to local storage cache
      console.log('Syncing data from PostgreSQL to local storage cache...');
      const usersRes = await dbQuery('SELECT * FROM users');
      set('wf_users', usersRes.rows.map(dbRowToUser));

      const wfsRes = await dbQuery('SELECT * FROM workflows');
      set(KEYS.WORKFLOWS, wfsRes.rows.map(dbRowToWorkflow));

      const logsRes = await dbQuery('SELECT * FROM run_logs');
      set(KEYS.LOGS, logsRes.rows.map(dbRowToLog));

      console.log('Database state synchronized successfully.');
    } catch (err) {
      console.error('Failed to initialize database tables or sync data. Using local storage fallback.', err);
      if (!get('wf_users')) {
        set('wf_users', [
          { username: 'admin', password: 'admin123', role: 'admin', displayName: 'Admin' },
          { username: 'user', password: 'user123', role: 'user', displayName: 'Viewer' }
        ]);
      }
    }
  }

  // ── Helpers ──────────────────────────────────────────────────
  function get(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); }
    catch { return null; }
  }

  function set(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function token() {
    return Math.random().toString(36).slice(2, 10) +
           Math.random().toString(36).slice(2, 10);
  }

  // ── Workflows ────────────────────────────────────────────────
  const Workflows = {
    all() { return get(KEYS.WORKFLOWS) || []; },

    get(id) {
      return this.all().find(w => w.id === id) || null;
    },

    getByToken(shareToken) {
      return this.all().find(w => w.shareToken === shareToken && w.published) || null;
    },

    create(data) {
      const workflows = this.all();
      const wf = {
        id: uid(),
        name: data.name || 'Untitled Workflow',
        description: data.description || '',
        nodes: data.nodes || [],
        edges: data.edges || [],
        nodePositions: data.nodePositions || {},
        published: false,
        shareToken: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        runCount: 0,
        lastRun: null,
        status: 'draft',
      };
      workflows.push(wf);
      set(KEYS.WORKFLOWS, workflows);

      // Write-through to Postgres
      const dbRow = workflowToDbRow(wf);
      bgQuery(`
        INSERT INTO workflows (id, name, description, nodes, edges, node_positions, published, share_token, created_at, updated_at, run_count, last_run, status, uploaded_data)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `, [
        dbRow.id, dbRow.name, dbRow.description, dbRow.nodes, dbRow.edges, dbRow.node_positions,
        dbRow.published, dbRow.share_token, dbRow.created_at, dbRow.updated_at, dbRow.run_count,
        dbRow.last_run, dbRow.status, dbRow.uploaded_data
      ]);

      return wf;
    },

    update(id, updates) {
      const workflows = this.all();
      const idx = workflows.findIndex(w => w.id === id);
      if (idx === -1) return null;
      workflows[idx] = {
        ...workflows[idx],
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      set(KEYS.WORKFLOWS, workflows);

      // Write-through to Postgres
      const wf = workflows[idx];
      const dbRow = workflowToDbRow(wf);
      bgQuery(`
        UPDATE workflows SET
          name = $1, description = $2, nodes = $3, edges = $4, node_positions = $5,
          published = $6, share_token = $7, updated_at = $8, run_count = $9,
          last_run = $10, status = $11, uploaded_data = $12
        WHERE id = $13
      `, [
        dbRow.name, dbRow.description, dbRow.nodes, dbRow.edges, dbRow.node_positions,
        dbRow.published, dbRow.share_token, dbRow.updated_at, dbRow.run_count,
        dbRow.last_run, dbRow.status, dbRow.uploaded_data, dbRow.id
      ]);

      return workflows[idx];
    },

    publish(id) {
      const wf = this.get(id);
      if (!wf) return null;
      const shareToken = wf.shareToken || token();
      return this.update(id, { published: true, shareToken, status: 'published' });
    },

    unpublish(id) {
      return this.update(id, { published: false, status: 'draft' });
    },

    delete(id) {
      const workflows = this.all().filter(w => w.id !== id);
      set(KEYS.WORKFLOWS, workflows);
      // also remove logs
      const logs = RunLogs.all().filter(l => l.workflowId !== id);
      set(KEYS.LOGS, logs);

      // Write-through to Postgres
      bgQuery('DELETE FROM workflows WHERE id = $1', [id]);
      bgQuery('DELETE FROM run_logs WHERE workflow_id = $1', [id]);
    },

    save(id, nodes, edges, nodePositions, uploadedData) {
      const updates = { nodes, edges, nodePositions };
      if (uploadedData !== undefined) updates.uploadedData = uploadedData;
      return this.update(id, updates);
    },

    saveRaw(wf) {
      const workflows = this.all();
      const idx = workflows.findIndex(w => w.id === wf.id);
      if (idx === -1) return null;
      workflows[idx] = { ...wf, updatedAt: new Date().toISOString() };
      set(KEYS.WORKFLOWS, workflows);

      // Write-through to Postgres
      const updatedWf = workflows[idx];
      const dbRow = workflowToDbRow(updatedWf);
      bgQuery(`
        UPDATE workflows SET
          name = $1, description = $2, nodes = $3, edges = $4, node_positions = $5,
          published = $6, share_token = $7, updated_at = $8, run_count = $9,
          last_run = $10, status = $11, uploaded_data = $12
        WHERE id = $13
      `, [
        dbRow.name, dbRow.description, dbRow.nodes, dbRow.edges, dbRow.node_positions,
        dbRow.published, dbRow.share_token, dbRow.updated_at, dbRow.run_count,
        dbRow.last_run, dbRow.status, dbRow.uploaded_data, dbRow.id
      ]);

      return workflows[idx];
    },
  };

  // ── Run Logs ─────────────────────────────────────────────────
  const RunLogs = {
    all() { return get(KEYS.LOGS) || []; },

    forWorkflow(workflowId) {
      return this.all().filter(l => l.workflowId === workflowId)
        .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    },

    add(workflowId, status, durationMs, outputRows, error) {
      const logs = this.all();
      const log = {
        id: uid(),
        workflowId,
        status,        // 'success' | 'failed'
        startTime: new Date().toISOString(),
        durationMs,
        outputRows: outputRows || 0,
        error: error || null,
      };
      logs.unshift(log);
      const filtered = logs.slice(0, 200);
      set(KEYS.LOGS, filtered);

      // Write-through to Postgres
      bgQuery(`
        INSERT INTO run_logs (id, workflow_id, status, start_time, duration_ms, output_rows, error)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        log.id, log.workflowId, log.status, log.startTime, log.durationMs, log.outputRows, log.error
      ]);

      // update workflow run stats
      Workflows.update(workflowId, {
        runCount: (Workflows.get(workflowId)?.runCount || 0) + 1,
        lastRun: log.startTime,
      });
      return log;
    },
  };

  // ── Users ────────────────────────────────────────────────────
  const Users = {
    all() { return get('wf_users') || []; }
  };

  // ── Session ──────────────────────────────────────────────────
  const Session = {
    get() { return get(KEYS.SESSION); },
    set(data) { set(KEYS.SESSION, data); },
    clear() { localStorage.removeItem(KEYS.SESSION); },
    isAdmin() { return this.get()?.role === 'admin'; },
    isLoggedIn() { return !!this.get(); },
  };

  // ── Seed demo data ───────────────────────────────────────────
  function seedIfEmpty() {
    if (Workflows.all().length === 0) {
      const w1 = Workflows.create({
        name: 'Customer Data Cleaner',
        description: 'Reads customer CSV, adds Age from DOB, maps country to ISO code, detects phone operator.',
        nodes: [
          { id:'n1', type:'source', subtype:'csv', label:'CSV Source', config:{ subtype:'csv', columns:['Name','DOB','Country','Phone','Amount'], sampleData:[['Alice','1990-05-12','India','+91-9876543210','1200'],['Bob','1985-11-23','USA','+1-2025551234','3400'],['Carol','1992-07-04','Germany','+91-8012345678','2100'],['David','1978-03-15','India','+91-7712345678','560'],['Emma','1995-09-22','UK','+44-7912345678','4200']] } },
          { id:'n2', type:'transform', subtype:'add_column', label:'Add Age from DOB', config:{ subtype:'add_column', targetColumn:'Age', formula:'datediff(DOB)', sourceColumn:'DOB' } },
          { id:'n3', type:'transform', subtype:'lookup_map', label:'Country → ISO Code', config:{ subtype:'lookup_map', sourceColumn:'Country', targetColumn:'CountryCode', map:{ India:'IND', USA:'USA', Germany:'DEU', UK:'GBR', France:'FRA' } } },
          { id:'n4', type:'transform', subtype:'add_column', label:'Detect Operator', config:{ subtype:'add_column', targetColumn:'Operator', formula:'operator(Phone)', sourceColumn:'Phone' } },
          { id:'n5', type:'output', subtype:'csv', label:'CSV Export', config:{ subtype:'csv', filename:'customers_clean.csv' } },
        ],
        edges: [
          { id:'e1', from:'n1', to:'n2' },
          { id:'e2', from:'n2', to:'n3' },
          { id:'e3', from:'n3', to:'n4' },
          { id:'e4', from:'n4', to:'n5' },
        ],
        nodePositions: { n1:{x:40,y:140}, n2:{x:250,y:80}, n3:{x:460,y:140}, n4:{x:670,y:80}, n5:{x:880,y:140} },
      });
      Workflows.publish(w1.id);
      RunLogs.add(w1.id, 'success', 342, 1200);
      RunLogs.add(w1.id, 'success', 289, 1198);

      const w2 = Workflows.create({
        name: 'Sales Report Transformer',
        description: 'Aggregates sales data, filters by region, exports to Excel.',
        nodes: [
          { id: 'n1', type: 'source', subtype: 'csv', label: 'Sales CSV', config: { columns: ['Product','Region','Amount','Date'], sampleData: [['Widget A','North',1250,'2026-01-15'],['Widget B','South',890,'2026-01-15'],['Widget C','North',2100,'2026-01-16']] } },
          { id: 'n2', type: 'filter', subtype: 'row_filter', label: 'Filter Region', config: { column: 'Region', operator: 'equals', value: 'North' } },
          { id: 'n3', type: 'output', subtype: 'json', label: 'JSON Export', config: { filename: 'sales_north.json' } },
        ],
        edges: [
          { id: 'e1', from: 'n1', to: 'n2' },
          { id: 'e2', from: 'n2', to: 'n3' },
        ],
        nodePositions: { n1: {x:60,y:140}, n2: {x:300,y:140}, n3: {x:540,y:140} },
      });
      RunLogs.add(w2.id, 'failed', 120, 0, 'Schema mismatch: expected date column');

      Workflows.create({
        name: 'API Data Importer',
        description: 'Connects to REST API, transforms JSON response, loads to CSV.',
        nodes: [
          { id: 'n1', type: 'source', subtype: 'api', label: 'REST API Source', config: { url: 'https://api.example.com/data', method: 'GET', auth: 'Bearer token' } },
          { id: 'n2', type: 'transform', subtype: 'rename_column', label: 'Rename Columns', config: { renames: { user_id: 'UserID', full_name: 'Name' } } },
          { id: 'n3', type: 'output', subtype: 'csv', label: 'CSV Export', config: { filename: 'api_data.csv' } },
        ],
        edges: [
          { id: 'e1', from: 'n1', to: 'n2' },
          { id: 'e2', from: 'n2', to: 'n3' },
        ],
        nodePositions: { n1: {x:60,y:140}, n2: {x:300,y:140}, n3: {x:540,y:140} },
      });
    }
  }

  return { init, Workflows, RunLogs, Users, Session, seedIfEmpty, uid };
})();

window.Storage = Storage;
