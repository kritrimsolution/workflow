/* ================================================================
   admin.js — Admin dashboard
   ================================================================ */

const Admin = (() => {

  function render() {
    if (!Auth.requireAdmin()) return;
    const workflows = Storage.Workflows.all();
    const logs = Storage.RunLogs.all();

    const totalRuns = logs.length;
    const successRuns = logs.filter(l => l.status === 'success').length;
    const published = workflows.filter(w => w.published).length;

    document.getElementById('app-root').innerHTML = `
      <nav class="top-nav">
        <a class="nav-logo" onclick="Router.navigate('admin')" style="cursor:pointer">
          <div class="nav-logo-icon">${UI.logoSVG}</div>
          <span class="nav-logo-text">DataFlow</span>
        </a>
        <div class="nav-center">
          <button class="nav-link active" onclick="Router.navigate('admin')">Dashboard</button>
          <button class="nav-link" onclick="Admin.showLogs()">Run Logs</button>
        </div>
        <div class="nav-right">
          <div class="nav-user-badge">
            <div class="nav-user-dot"></div>
            <span>${escHtml(Storage.Session.get()?.displayName || 'Admin')}</span>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="Auth.logout()">Logout</button>
        </div>
      </nav>

      <div class="page">
        <div class="page-content">
          <div class="dashboard-header">
            <div>
              <div class="eyebrow">Admin Panel</div>
              <h1 class="dashboard-title">Workflows</h1>
            </div>
            <button class="btn btn-primary" onclick="Admin.newWorkflow()">
              + New Workflow ↗
            </button>
          </div>

          <!-- Stats -->
          <div class="stats-grid">
            <div class="stat-card accent">
              <div class="stat-label">Total Workflows</div>
              <div class="stat-value">${workflows.length}</div>
              <div class="stat-sub">All time</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Published</div>
              <div class="stat-value">${published}</div>
              <div class="stat-sub">With share links</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Total Runs</div>
              <div class="stat-value">${totalRuns}</div>
              <div class="stat-sub">All workflows</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Success Rate</div>
              <div class="stat-value">${totalRuns ? Math.round(successRuns/totalRuns*100) : 0}%</div>
              <div class="stat-sub">${successRuns} of ${totalRuns} runs</div>
            </div>
          </div>

          <!-- Workflows List -->
          <div class="workflows-section-header">
            <div class="eyebrow">All Workflows</div>
            <div style="display:flex;gap:8px;">
              <input class="form-input" id="wf-search" placeholder="Search workflows…"
                style="width:220px;padding:8px 14px;"
                oninput="Admin.filterWorkflows(this.value)"/>
            </div>
          </div>

          <div class="workflows-grid" id="workflows-grid">
            ${workflows.length === 0 ? renderEmpty() : workflows.map(renderWorkflowCard).join('')}
          </div>
        </div>
      </div>

      <!-- Modals -->
      <div class="modal-backdrop" id="modal-create">
        <div class="modal">
          <div class="modal-header">
            <span class="modal-title">New Workflow</span>
            <button class="modal-close" onclick="UI.closeModal('modal-create')">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Workflow Name</label>
              <input class="form-input" id="new-wf-name" placeholder="My Workflow" autofocus/>
            </div>
            <div class="form-group">
              <label class="form-label">Description (optional)</label>
              <textarea class="form-textarea" id="new-wf-desc" rows="3" placeholder="What does this workflow do?"></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="UI.closeModal('modal-create')">Cancel</button>
            <button class="btn btn-primary" onclick="Admin.createWorkflow()">Create ↗</button>
          </div>
        </div>
      </div>

      <div class="modal-backdrop" id="modal-share">
        <div class="modal">
          <div class="modal-header">
            <span class="modal-title">Share Workflow</span>
            <button class="modal-close" onclick="UI.closeModal('modal-share')">✕</button>
          </div>
          <div class="modal-body">
            <p style="color:var(--color-fog-veil);margin-bottom:var(--spacing-20);">
              Share this link with viewers. They can view the workflow read-only without logging in.
            </p>
            <div class="share-box">
              <input class="share-box-url" id="share-url" readonly value=""/>
              <button class="btn btn-sm btn-primary" onclick="Admin.copyShareLink()">Copy</button>
            </div>
            <div style="margin-top:var(--spacing-16);display:flex;gap:8px;">
              <button class="btn btn-sm btn-secondary" onclick="Admin.openShareLink()">Open Link ↗</button>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-backdrop" id="modal-logs">
        <div class="modal" style="max-width:720px">
          <div class="modal-header">
            <span class="modal-title">Run Logs</span>
            <button class="modal-close" onclick="UI.closeModal('modal-logs')">✕</button>
          </div>
          <div class="modal-body" id="modal-logs-body" style="padding:0"></div>
        </div>
      </div>

      <div class="toast-container" id="toast-container"></div>
    `;
  }

  function renderWorkflowCard(wf) {
    const logs = Storage.RunLogs.forWorkflow(wf.id);
    const lastRun = logs[0];
    const statusBadge = wf.published
      ? `<span class="badge badge-published">Published</span>`
      : `<span class="badge badge-draft">Draft</span>`;

    return `
      <div class="workflow-card" onclick="Router.navigate('canvas', '${wf.id}')" id="wf-card-${wf.id}">
        <div>
          <div class="workflow-card-name">${escHtml(wf.name)}</div>
          <div class="workflow-card-desc mt-8">${escHtml(wf.description || 'No description')}</div>
        </div>
        <div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
            ${statusBadge}
            ${lastRun ? `<span class="badge ${lastRun.status === 'success' ? 'badge-success' : 'badge-failed'}">${lastRun.status === 'success' ? '✓' : '✗'} Last run</span>` : ''}
          </div>
          <div style="font-size:11px;color:var(--color-fog-veil);display:flex;gap:16px;flex-wrap:wrap;">
            <span>${(wf.nodes||[]).length} nodes</span>
            <span>${(wf.edges||[]).length} edges</span>
            <span>${wf.runCount||0} runs</span>
            <span>Updated ${timeAgo(wf.updatedAt)}</span>
          </div>
        </div>
        <div class="workflow-card-actions" onclick="event.stopPropagation()">
          <button class="btn btn-sm btn-secondary" onclick="Router.navigate('canvas','${wf.id}')">Edit</button>
          ${wf.published
            ? `<button class="btn btn-sm btn-secondary" onclick="Admin.showShare('${wf.id}')">Share Link</button>
               <button class="btn btn-sm btn-danger" onclick="Admin.unpublish('${wf.id}')">Unpublish</button>`
            : `<button class="btn btn-sm btn-primary" onclick="Admin.publishWorkflow('${wf.id}')">Publish</button>`
          }
          <button class="btn btn-sm btn-danger" onclick="Admin.deleteWorkflow('${wf.id}')">Delete</button>
          <button class="btn btn-sm btn-secondary" onclick="Admin.showWorkflowLogs('${wf.id}')">Logs</button>
        </div>
      </div>
    `;
  }

  function renderEmpty() {
    return `
      <div class="workflow-empty" style="grid-column:1/-1">
        <div class="workflow-empty-icon" style="width:48px;height:48px;margin:0 auto var(--spacing-20);opacity:0.4;">${UI.logoSVG}</div>
        <div class="workflow-empty-title">No workflows yet</div>
        <p>Create your first workflow to get started.</p>
        <button class="btn btn-primary mt-20" onclick="Admin.newWorkflow()">+ Create Workflow</button>
      </div>
    `;
  }

  function newWorkflow() {
    UI.openModal('modal-create');
    setTimeout(() => document.getElementById('new-wf-name')?.focus(), 100);
  }

  function createWorkflow() {
    const name = document.getElementById('new-wf-name')?.value?.trim();
    const desc = document.getElementById('new-wf-desc')?.value?.trim();
    if (!name) { UI.toast('Please enter a workflow name', 'error'); return; }
    const wf = Storage.Workflows.create({ name, description: desc });
    UI.closeModal('modal-create');
    Router.navigate('canvas', wf.id);
  }

  function publishWorkflow(id) {
    const wf = Storage.Workflows.publish(id);
    const url = `${location.origin}${location.pathname}#/view/${wf.shareToken}`;
    render();
    setTimeout(() => {
      document.getElementById('share-url').value = url;
      UI.openModal('modal-share');
    }, 100);
    UI.toast('Workflow published!', 'success');
  }

  function unpublish(id) {
    if (!confirm('Unpublish this workflow? The share link will stop working.')) return;
    Storage.Workflows.unpublish(id);
    render();
    UI.toast('Workflow unpublished', 'info');
  }

  function showShare(id) {
    const wf = Storage.Workflows.get(id);
    if (!wf?.shareToken) return;
    const url = `${location.origin}${location.pathname}#/view/${wf.shareToken}`;
    document.getElementById('share-url').value = url;
    UI.openModal('modal-share');
  }

  function copyShareLink() {
    const url = document.getElementById('share-url')?.value;
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => UI.toast('Link copied to clipboard!', 'success'));
  }

  function openShareLink() {
    const url = document.getElementById('share-url')?.value;
    if (url) window.open(url, '_blank');
  }

  function deleteWorkflow(id) {
    const wf = Storage.Workflows.get(id);
    if (!confirm(`Delete "${wf?.name}"? This cannot be undone.`)) return;
    Storage.Workflows.delete(id);
    render();
    UI.toast('Workflow deleted', 'info');
  }

  function showLogs() {
    const logs = Storage.RunLogs.all().slice(0, 50);
    const workflows = Storage.Workflows.all();
    const wfMap = {};
    workflows.forEach(w => wfMap[w.id] = w.name);

    const body = `
      <div style="padding:var(--spacing-24);">
        <div class="run-logs-list">
          ${logs.length === 0 ? '<div style="color:var(--color-fog-veil);text-align:center;padding:40px;">No runs yet</div>' :
            logs.map(l => `
              <div class="run-log-item">
                <span class="badge ${l.status === 'success' ? 'badge-success' : 'badge-failed'}">${l.status === 'success' ? 'Success' : 'Failed'}</span>
                <span class="run-log-name">${escHtml(wfMap[l.workflowId] || l.workflowId)}</span>
                <span class="run-log-time">${timeAgo(l.startTime)}</span>
                <span class="run-log-duration">${l.durationMs}ms</span>
                <span style="font-size:11px;color:var(--color-fog-veil);">${l.outputRows} rows</span>
                ${l.error ? `<span style="font-size:11px;color:#f87171;max-width:200px;overflow:hidden;text-overflow:ellipsis;" title="${escHtml(l.error)}">${escHtml(l.error.slice(0,50))}</span>` : ''}
              </div>
            `).join('')}
        </div>
      </div>
    `;
    document.getElementById('modal-logs-body').innerHTML = body;
    UI.openModal('modal-logs');
  }

  function showWorkflowLogs(id) {
    const logs = Storage.RunLogs.forWorkflow(id);
    const wf = Storage.Workflows.get(id);
    const body = `
      <div style="padding:var(--spacing-24);">
        <div style="margin-bottom:var(--spacing-16);color:var(--color-fog-veil);font-size:13px;">
          ${logs.length} run${logs.length !== 1 ? 's' : ''} for "${escHtml(wf?.name||'')}"
        </div>
        <div class="run-logs-list">
          ${logs.length === 0 ? '<div style="color:var(--color-fog-veil);text-align:center;padding:40px;">No runs yet</div>' :
            logs.map(l => `
              <div class="run-log-item">
                <span class="badge ${l.status === 'success' ? 'badge-success' : 'badge-failed'}">${l.status === 'success' ? 'Success' : 'Failed'}</span>
                <span class="run-log-time">${new Date(l.startTime).toLocaleString()}</span>
                <span class="run-log-duration">${l.durationMs}ms</span>
                <span style="font-size:11px;color:var(--color-fog-veil);">${l.outputRows} rows</span>
                ${l.error ? `<span style="font-size:11px;color:#f87171;">${escHtml(l.error.slice(0,80))}</span>` : ''}
              </div>
            `).join('')}
        </div>
      </div>
    `;
    document.getElementById('modal-logs-body').innerHTML = body;
    UI.openModal('modal-logs');
  }

  function filterWorkflows(query) {
    const workflows = Storage.Workflows.all();
    const q = query.toLowerCase();
    const filtered = q ? workflows.filter(w =>
      w.name.toLowerCase().includes(q) ||
      (w.description||'').toLowerCase().includes(q)
    ) : workflows;

    const grid = document.getElementById('workflows-grid');
    if (grid) grid.innerHTML = filtered.length ? filtered.map(renderWorkflowCard).join('') : renderEmpty();
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
    render,
    newWorkflow, createWorkflow,
    publishWorkflow, unpublish,
    showShare, copyShareLink, openShareLink,
    deleteWorkflow,
    showLogs, showWorkflowLogs,
    filterWorkflows,
  };
})();

window.Admin = Admin;
