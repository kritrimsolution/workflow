/* ================================================================
   storage.js — localStorage CRUD for workflows, logs, auth
   ================================================================ */

const Storage = (() => {
  const KEYS = {
    WORKFLOWS: 'wf_workflows',
    LOGS: 'wf_run_logs',
    SESSION: 'wf_session',
  };

  // ── Helpers ─────────────────────────────────────────────────
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
      // keep last 50 per workflow
      const filtered = logs.slice(0, 200);
      set(KEYS.LOGS, filtered);
      // update workflow run stats
      Workflows.update(workflowId, {
        runCount: (Workflows.get(workflowId)?.runCount || 0) + 1,
        lastRun: log.startTime,
      });
      return log;
    },
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

  return { Workflows, RunLogs, Session, seedIfEmpty, uid };
})();

window.Storage = Storage;
