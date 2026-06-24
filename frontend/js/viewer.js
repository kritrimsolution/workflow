/* ================================================================
   viewer.js — Read-only workflow viewer (user / shared link)
   ================================================================ */

const Viewer = (() => {

  // ── Shared link viewer (no login required) ────────────────────
  function renderShared(shareToken) {
    const wf = Storage.Workflows.getByToken(shareToken);
    if (!wf) {
      document.getElementById('app-root').innerHTML = `
        <nav class="top-nav">
          <div class="nav-logo">
            <div class="nav-logo-icon">${UI.logoSVG}</div>
            <span class="nav-logo-text">DataFlow</span>
          </div>
          <div class="nav-right">
            <button class="btn btn-ghost btn-sm" onclick="Router.navigate('login')">Login</button>
          </div>
        </nav>
        <div class="page">
          <div class="page-content" style="text-align:center;padding-top:120px;">
            <div style="width:48px;height:48px;margin:0 auto 24px;opacity:0.3">${UI.logoSVG}</div>
            <h1 style="font-size:36px;font-weight:400;letter-spacing:-0.5px;margin-bottom:12px;">Workflow not found</h1>
            <p style="color:var(--color-fog-veil);">This link may be expired or the workflow was unpublished.</p>
            <button class="btn btn-primary mt-32" onclick="Router.navigate('login')">Go to Login ↗</button>
          </div>
        </div>
        <div class="toast-container" id="toast-container"></div>
      `;
      return;
    }
    renderWorkflow(wf, true);
  }

  // ── User dashboard (logged in as user) ────────────────────────
  function renderUserDashboard() {
    if (!Auth.requireAuth()) return;
    const session = Storage.Session.get();
    const workflows = Storage.Workflows.all().filter(w => w.published);

    document.getElementById('app-root').innerHTML = `
      <nav class="top-nav">
        <div class="nav-logo">
          <div class="nav-logo-icon">${UI.logoSVG}</div>
          <span class="nav-logo-text">DataFlow</span>
        </div>
        <div class="nav-center">
          <span class="nav-link active">My Workflows</span>
        </div>
        <div class="nav-right">
          <div class="nav-user-badge">
            <div class="nav-user-dot"></div>
            <span>${escHtml(session?.displayName || 'Viewer')}</span>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="Auth.logout()">Logout</button>
        </div>
      </nav>

      <div class="page">
        <div class="page-content">
          <div class="dashboard-header">
            <div>
              <div class="eyebrow">Viewer Access</div>
              <h1 class="dashboard-title">Shared Workflows</h1>
            </div>
          </div>

          ${workflows.length === 0 ? `
            <div class="workflow-empty">
              <div class="workflow-empty-icon" style="width:48px;height:48px;margin:0 auto var(--spacing-20);opacity:0.4;">${UI.logoSVG}</div>
              <div class="workflow-empty-title">No published workflows</div>
              <p>No workflows have been shared with you yet.</p>
            </div>
          ` : `
            <div class="user-dash-grid">
              ${workflows.map(wf => `
                <div class="user-workflow-card" onclick="Viewer.openWorkflow('${wf.id}')">
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
                    <span class="badge badge-published">Published</span>
                    <span style="font-size:24px;opacity:0.5">↗</span>
                  </div>
                  <div style="font-size:22px;font-weight:400;letter-spacing:-0.29px;color:var(--color-snow-sheet);margin-bottom:10px;">${escHtml(wf.name)}</div>
                  <div style="font-size:14px;color:var(--color-fog-veil);margin-bottom:16px;">${escHtml(wf.description || 'No description')}</div>
                  <div style="font-size:11px;color:rgba(187,199,198,0.5);display:flex;gap:12px;">
                    <span>${(wf.nodes||[]).length} nodes</span>
                    <span>${wf.runCount||0} runs</span>
                    <span>${wf.lastRun ? 'Last run ' + timeAgo(wf.lastRun) : 'Never run'}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </div>
      <div class="toast-container" id="toast-container"></div>
    `;
  }

  function openWorkflow(id) {
    const wf = Storage.Workflows.get(id);
    if (wf) renderWorkflow(wf, true);
  }

  // ── Read-only workflow view ────────────────────────────────────
  function renderWorkflow(wf, isPublicView) {
    const logs = Storage.RunLogs.forWorkflow(wf.id);
    const session = Storage.Session.get();

    document.getElementById('app-root').innerHTML = `
      <nav class="top-nav">
        <div class="nav-logo" onclick="${session ? (session.role === 'admin' ? "Router.navigate('admin')" : "Viewer.renderUserDashboard()") : "Router.navigate('login')"}" style="cursor:pointer">
          <div class="nav-logo-icon">${UI.logoSVG}</div>
          <span class="nav-logo-text">DataFlow</span>
        </div>
        <div class="nav-center">
          ${session ? `<button class="nav-link" onclick="${session.role === 'admin' ? "Router.navigate('admin')" : "Viewer.renderUserDashboard()"}">${session.role === 'admin' ? 'Dashboard' : 'Workflows'}</button>` : ''}
          ${session ? '<span style="color:var(--color-fog-veil);">/</span>' : ''}
          <span style="font-size:13px;color:var(--color-snow-sheet);">${escHtml(wf.name)}</span>
        </div>
        <div class="nav-right">
          <span class="badge badge-published" style="font-size:10px;">Read Only</span>
          ${session ? `<button class="btn btn-ghost btn-sm" onclick="Auth.logout()">Logout</button>` :
            `<button class="btn btn-ghost btn-sm" onclick="Router.navigate('login')">Login</button>`}
        </div>
      </nav>

      <div class="viewer-page">
        <div class="viewer-hero">
          <div class="eyebrow">Workflow</div>
          <h1 class="viewer-title">${escHtml(wf.name)}</h1>
          <div class="viewer-meta">
            ${wf.description ? `<span style="color:var(--color-fog-veil);font-size:14px;">${escHtml(wf.description)}</span>` : ''}
            <div class="viewer-meta-item">
              <span style="display:inline-block;width:14px;height:14px;vertical-align:middle;margin-right:4px;">${UI.logoSVG}</span><span>${(wf.nodes||[]).length} Nodes</span>
            </div>
            <div class="viewer-meta-item">
              <span>↔</span><span>${(wf.edges||[]).length} Connections</span>
            </div>
            <div class="viewer-meta-item">
              <span>▶</span><span>${wf.runCount||0} Total Runs</span>
            </div>
            <span class="badge badge-published">Published</span>
          </div>
        </div>

        <div class="viewer-canvas-wrap">
          <!-- Tabs -->
          <div class="tab-strip">
            <button class="tab-strip-item active" id="tab-canvas" onclick="Viewer._switchTab('canvas')">Canvas</button>
            <button class="tab-strip-item" id="tab-config" onclick="Viewer._switchTab('config')">Node Details</button>
            <button class="tab-strip-item" id="tab-logs" onclick="Viewer._switchTab('logs')">Run Logs</button>
            <button class="tab-strip-item" id="tab-preview" onclick="Viewer._switchTab('preview')">Run & Preview</button>
          </div>

          <!-- Canvas Tab -->
          <div id="view-tab-canvas">
            <div class="viewer-canvas-box">
              <div class="viewer-canvas-area" id="viewer-canvas">
                <svg style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;" xmlns="http://www.w3.org/2000/svg">
                  <g id="view-edges"></g>
                </svg>
                <div id="view-nodes" style="position:absolute;inset:0;"></div>
              </div>
            </div>
          </div>

          <!-- Node Details Tab -->
          <div id="view-tab-config" class="hidden">
            <div style="display:flex;flex-direction:column;gap:16px;">
              ${(wf.nodes||[]).map(node => renderNodeDetail(node)).join('')}
            </div>
          </div>

          <!-- Run Logs Tab -->
          <div id="view-tab-logs" class="hidden">
            <div class="run-logs-list">
              ${logs.length === 0 ?
                '<div style="text-align:center;padding:60px 0;color:var(--color-fog-veil);">No runs yet</div>' :
                logs.map(l => `
                  <div class="run-log-item">
                    <span class="badge ${l.status === 'success' ? 'badge-success' : 'badge-failed'}">${l.status === 'success' ? 'Success' : 'Failed'}</span>
                    <span class="run-log-time">${new Date(l.startTime).toLocaleString()}</span>
                    <span class="run-log-duration">${l.durationMs}ms</span>
                    <span style="font-size:12px;color:var(--color-fog-veil);">${l.outputRows} rows out</span>
                    ${l.error ? `<span style="font-size:11px;color:#f87171;">${escHtml(l.error.slice(0,100))}</span>` : ''}
                  </div>
                `).join('')
              }
            </div>
          </div>

          <!-- Preview Tab -->
          <div id="view-tab-preview" class="hidden">
            <div style="margin-bottom:20px;display:flex;align-items:center;gap:12px;">
              <button class="btn btn-primary" onclick="Viewer.runPreview('${wf.id}')">Run Workflow</button>
              <button class="btn btn-secondary" onclick="Viewer.downloadCSV('${wf.id}')">Download CSV</button>
              <button class="btn btn-secondary" onclick="Viewer.downloadJSON('${wf.id}')">Download JSON</button>
              <span id="viewer-run-info" style="font-size:12px;color:var(--color-fog-veil);"></span>
            </div>
            <div style="background:var(--surface-trench);border-radius:16px;overflow:hidden;">
              <div id="viewer-preview-body" style="overflow:auto;min-height:200px;display:flex;align-items:center;justify-content:center;color:rgba(187,199,198,0.3);font-size:13px;">
                Click "Run Workflow" to see a preview
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="toast-container" id="toast-container"></div>
    `;

    // Render read-only canvas nodes and edges
    setTimeout(() => renderViewCanvas(wf), 50);
  }

  function renderViewCanvas(wf) {
    const nodesContainer = document.getElementById('view-nodes');
    const edgesG = document.getElementById('view-edges');
    if (!nodesContainer || !edgesG) return;

    const NODE_TYPES_MAP = {
      source: { icon: 'CSV', colorClass: 'node-color-source' },
      transform: { icon: 'Add', colorClass: 'node-color-transform' },
      filter: { icon: 'Filt', colorClass: 'node-color-filter' },
      output: { icon: 'Out', colorClass: 'node-color-output' },
    };

    // Auto layout if no positions stored
    const positions = JSON.parse(JSON.stringify(wf.nodePositions || {}));
    if (!Object.keys(positions).length) {
      wf.nodes.forEach((n, i) => { positions[n.id] = { x: 40 + i * 220, y: 180 }; });
    }

    // Scale positions to fit canvas
    const pos = Object.values(positions);
    const maxX = Math.max(...pos.map(p => p.x)) + 180;
    const maxY = Math.max(...pos.map(p => p.y)) + 80;
    const canvasW = nodesContainer.parentElement.offsetWidth || 800;
    const canvasH = nodesContainer.parentElement.offsetHeight || 480;
    const scaleX = maxX > canvasW ? (canvasW - 40) / maxX : 1;
    const scaleY = maxY > canvasH ? (canvasH - 40) / maxY : 1;
    const scale = Math.min(scaleX, scaleY, 1);

    // Render nodes
    (wf.nodes || []).forEach(node => {
      const p = positions[node.id] || { x: 40, y: 40 };
      const x = Math.round(p.x * scale) + 20;
      const y = Math.round(p.y * scale) + 20;
      const info = NODE_TYPES_MAP[node.type] || { icon: 'HEX', colorClass: 'node-color-source' };
      const iconSVG = UI.NODE_ICONS[node.subtype || node.config?.subtype || node.type] || info.icon;

      const el = document.createElement('div');
      el.className = 'canvas-node';
      el.style.cssText = `left:${x}px;top:${y}px;cursor:default;`;
      el.innerHTML = `
        <div class="canvas-node-header">
          <div class="canvas-node-icon ${info.colorClass}">${iconSVG}</div>
          <div class="canvas-node-title">${escHtml(node.label)}</div>
        </div>
        <div class="canvas-node-body">
          <div class="canvas-node-detail">${escHtml(getViewNodeSummary(node))}</div>
        </div>
      `;
      nodesContainer.appendChild(el);
    });

    // Render edges
    const NODE_W = 180, NODE_H = 72;
    (wf.edges || []).forEach(edge => {
      const fp = positions[edge.from], tp = positions[edge.to];
      if (!fp || !tp) return;
      const x1 = Math.round(fp.x * scale) + 20 + NODE_W;
      const y1 = Math.round(fp.y * scale) + 20 + NODE_H / 2;
      const x2 = Math.round(tp.x * scale) + 20;
      const y2 = Math.round(tp.y * scale) + 20 + NODE_H / 2;

      const x2_curve = x2 - 6;
      const cx1 = x1 + Math.abs(x2 - x1) * 0.4;
      const cx2 = x2 - Math.abs(x2 - x1) * 0.4;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M${x1},${y1} C${cx1},${y1} ${cx2},${y2} ${x2_curve},${y2}`);
      path.setAttribute('class', 'canvas-edge edge-animated');
      edgesG.appendChild(path);

      // Manual arrowhead polygon pointing right
      const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      arrow.setAttribute('points', `${x2},${y2} ${x2-8},${y2-4} ${x2-8},${y2+4}`);
      arrow.setAttribute('fill', 'var(--color-current-teal)');
      arrow.setAttribute('opacity', '0.8');
      edgesG.appendChild(arrow);
    });
  }

  function getViewNodeSummary(node) {
    const c = node.config || {};
    switch (node.subtype || node.type) {
      case 'csv': return c.csvText ? 'CSV Data loaded' : 'CSV Source';
      case 'json': return c.jsonText ? 'JSON Data loaded' : 'JSON Source';
      case 'api': return c.url ? c.url.slice(0, 28) + '…' : 'REST API';
      case 'add_column': return c.targetColumn ? `→ ${c.targetColumn}` : 'Add column';
      case 'rename_column': return 'Rename columns';
      case 'delete_column': return c.columns?.length ? `Drop: ${c.columns.join(', ').slice(0,20)}` : 'Delete column';
      case 'lookup_map': return c.sourceColumn ? `${c.sourceColumn} → ${c.targetColumn||'?'}` : 'Lookup map';
      case 'row_filter': return c.column ? `${c.column} ${c.operator||''} ${c.value||''}` : 'Row filter';
      case 'text_transform': return c.column ? `${c.operation||''} on ${c.column}` : 'Text transform';
      case 'replace_value': return c.column ? `Replace in ${c.column}` : 'Replace';
      default: return c.filename || '';
    }
  }

  function renderNodeDetail(node) {
    const c = node.config || {};
    const info = { source: 'CSV', transform: 'Add', filter: 'Filt', output: 'Out' }[node.type] || 'HEX';
    const colorMap = { source: 'node-color-source', transform: 'node-color-transform', filter: 'node-color-filter', output: 'node-color-output' };

    let details = '';
    switch (node.subtype || node.type) {
      case 'csv': details = c.csvText ? `<pre style="font-size:11px;color:var(--color-fog-veil);overflow:auto;max-height:100px;">${escHtml(c.csvText.slice(0,300))}</pre>` : '<em>No data</em>'; break;
      case 'json': details = c.jsonText ? `<pre style="font-size:11px;color:var(--color-fog-veil);overflow:auto;max-height:100px;">${escHtml(c.jsonText.slice(0,300))}</pre>` : '<em>No data</em>'; break;
      case 'api': details = `URL: <code>${escHtml(c.url||'not set')}</code><br>Method: ${c.method||'GET'}`; break;
      case 'add_column': details = `New column: <strong>${escHtml(c.targetColumn||'?')}</strong><br>Formula: <code>${escHtml(c.formula||'?')}</code>`; break;
      case 'rename_column': details = Object.entries(c.renames||{}).map(([k,v]) => `<code>${escHtml(k)}</code> → <code>${escHtml(v)}</code>`).join('<br>') || 'No renames'; break;
      case 'delete_column': details = `Drop: ${(c.columns||[]).map(col=>`<code>${escHtml(col)}</code>`).join(', ') || 'none'}`; break;
      case 'lookup_map': details = `Map <strong>${escHtml(c.sourceColumn||'?')}</strong> → <strong>${escHtml(c.targetColumn||'?')}</strong><br><pre style="font-size:11px;color:var(--color-fog-veil);">${escHtml(JSON.stringify(c.map||{}, null, 2).slice(0,200))}</pre>`; break;
      case 'row_filter': details = `<strong>${escHtml(c.column||'?')}</strong> ${c.operator||'='} <strong>${escHtml(c.value||'')}</strong>`; break;
      case 'text_transform': details = `<strong>${c.operation||'?'}</strong> on <strong>${escHtml(c.column||'?')}</strong>`; break;
      case 'replace_value': details = `In <strong>${escHtml(c.column||'?')}</strong>: replace <code>${escHtml(c.find||'')}</code> → <code>${escHtml(c.replace||'')}</code>`; break;
      default: details = c.filename ? `Filename: <code>${escHtml(c.filename)}</code>` : '';
    }

    return `
      <div class="card">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
          <div class="canvas-node-icon ${colorMap[node.type]||'node-color-source'}" style="width:32px;height:32px;">${info}</div>
          <div>
            <div style="font-size:16px;font-weight:400;color:var(--color-snow-sheet);">${escHtml(node.label)}</div>
            <div style="font-size:11px;color:var(--color-fog-veil);letter-spacing:1px;text-transform:uppercase;">${node.type} · ${node.subtype||''}</div>
          </div>
        </div>
        <div style="font-size:13px;color:var(--color-fog-veil);line-height:1.6;">${details}</div>
      </div>
    `;
  }

  let _viewState = null;

  async function runPreview(workflowId) {
    const wf = Storage.Workflows.get(workflowId);
    if (!wf) return;
    const result = await Engine.run(wf);
    const info = document.getElementById('viewer-run-info');
    const body = document.getElementById('viewer-preview-body');

    if (result.success) {
      _viewState = result.state;
      if (info) info.textContent = `${result.state.rows.length} rows · ${result.duration}ms`;
      if (body) {
        if (!result.state.rows.length) {
          body.innerHTML = '<div style="padding:40px;text-align:center;color:rgba(187,199,198,0.3);">No rows in output</div>';
          return;
        }
        const preview = result.state.rows.slice(0, 20);
        body.style.alignItems = '';
        body.style.justifyContent = '';
        body.innerHTML = `
          <table class="data-table">
            <thead><tr>${result.state.columns.map(c => `<th>${escHtml(c)}</th>`).join('')}</tr></thead>
            <tbody>${preview.map(row => `<tr>${result.state.columns.map(c => `<td>${row[c]===''||row[c]===null||row[c]===undefined ? '<span class="null-cell">null</span>' : escHtml(String(row[c]))}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>`;
      }
      Storage.RunLogs.add(workflowId, 'success', result.duration, result.state.rows.length);
      UI.toast(`Ran successfully — ${result.state.rows.length} rows`, 'success');
    } else {
      _viewState = null;
      if (body) body.innerHTML = `<div style="padding:40px;text-align:center;color:#f87171;">${escHtml(result.errors.join('<br>'))}</div>`;
      UI.toast('Run failed: ' + result.errors.join('; '), 'error');
    }
  }

  function downloadCSV(workflowId) {
    if (!_viewState) { runPreview(workflowId); return; }
    const wf = Storage.Workflows.get(workflowId);
    Engine.downloadCSV(_viewState, (wf?.name||'output').replace(/\s+/g,'_') + '.csv');
  }

  function downloadJSON(workflowId) {
    if (!_viewState) { runPreview(workflowId); return; }
    const wf = Storage.Workflows.get(workflowId);
    Engine.downloadJSON(_viewState, (wf?.name||'output').replace(/\s+/g,'_') + '.json');
  }

  function _switchTab(tab) {
    ['canvas','config','logs','preview'].forEach(t => {
      const tabEl = document.getElementById(`view-tab-${t}`);
      const btnEl = document.getElementById(`tab-${t}`);
      if (tabEl) tabEl.classList.toggle('hidden', t !== tab);
      if (btnEl) btnEl.classList.toggle('active', t === tab);
    });
  }

  function timeAgo(isoStr) {
    if (!isoStr) return 'never';
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  return {
    renderShared,
    renderUserDashboard,
    openWorkflow,
    runPreview, downloadCSV, downloadJSON,
    _switchTab,
  };
})();

window.Viewer = Viewer;
