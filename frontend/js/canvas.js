/* ================================================================
   canvas.js — Visual workflow canvas with prompt AI, file upload,
               draggable columns, and dual preview panel
   ================================================================ */

const Canvas = (() => {
  // ── State ─────────────────────────────────────────────────────
  let workflowId = null;
  let nodes = [];
  let edges = [];
  let nodePositions = {};
  let selectedNodeId = null;
  let selectedEdgeId = null;
  let dragging = null;
  let connecting = null;
  let isDirty = false;
  let historyStack = [];
  let isExecutingCompoundAction = false;
  let dragStartSnapshot = null;

  function pushHistory() {
    if (isExecutingCompoundAction) return;
    historyStack.push({
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
      nodePositions: JSON.parse(JSON.stringify(nodePositions))
    });
    if (historyStack.length > 50) {
      historyStack.shift();
    }
  }
  let zoom = 1.0;
  let panX = 0;
  let panY = 0;
  let paletteTab = 'data';    // 'nodes' | 'data'
  let previewTab = 'original'; // 'original' | 'transformed'
  let uploadedData = null;    // { columns, rows, types, fileName, fileType }
  let _lastRunState = null;
  let chatHistory = [];
  let isChatLoading = false;

  // Panning State
  let isPanning = false;
  let panStart = { x: 0, y: 0 };
  let scrollStart = { x: 0, y: 0 };

  // ── Node type definitions ────────────────────────────────────
  const NODE_TYPES = [
    { section: 'Sources', items: [
      { type:'source', subtype:'csv',   label:'CSV Source',   icon:'CSV', colorClass:'node-color-source',    desc:'Upload or paste CSV' },
      { type:'source', subtype:'json',  label:'JSON Source',  icon:'JSON',colorClass:'node-color-source',    desc:'Upload or paste JSON' },
      { type:'source', subtype:'api',   label:'REST API',     icon:'API', colorClass:'node-color-source',    desc:'Fetch from endpoint' },
      { type:'source', subtype:'db',    label:'Postgres DB',  icon:'DB',  colorClass:'node-color-source',    desc:'Query PostgreSQL Database' },
    ]},
    { section: 'Transforms', items: [
      { type:'transform', subtype:'add_column',    label:'Add Column',     icon:'+Col', colorClass:'node-color-transform', desc:'Compute new column' },
      { type:'transform', subtype:'rename_column', label:'Rename Column',  icon:'Ren', colorClass:'node-color-transform', desc:'Rename columns' },
      { type:'transform', subtype:'delete_column', label:'Delete Column',  icon:'Del', colorClass:'node-color-transform', desc:'Remove columns' },
      { type:'transform', subtype:'lookup_map',    label:'Lookup Map',     icon:'Map', colorClass:'node-color-transform', desc:'Map values' },
      { type:'transform', subtype:'text_transform',label:'Text Transform', icon:'Aa', colorClass:'node-color-transform', desc:'Case / trim' },
      { type:'transform', subtype:'replace_value', label:'Replace Value',  icon:'Repl', colorClass:'node-color-transform', desc:'Find & replace' },
      { type:'transform', subtype:'mapping',       label:'Data Mapper',    icon:'Mapp', colorClass:'node-color-transform', desc:'Schema field mapping & transforms' },
    ]},
    { section: 'Filters', items: [
      { type:'filter', subtype:'row_filter', label:'Row Filter', icon:'Filt', colorClass:'node-color-filter', desc:'Filter rows by condition' },
      { type:'filter', subtype:'rule_engine',label:'Rule Engine',icon:'Rule', colorClass:'node-color-filter', desc:'Validate and evaluate data rules' },
    ]},
    { section: 'Outputs', items: [
      { type:'output', subtype:'csv',      label:'CSV Export',  icon:'CSV', colorClass:'node-color-output', desc:'Download CSV' },
      { type:'output', subtype:'json_out', label:'JSON Export', icon:'JSON', colorClass:'node-color-output', desc:'Download JSON' },
    ]},
  ];

  function getTypeInfo(type, subtype) {
    for (const sec of NODE_TYPES) {
      for (const item of sec.items) {
        if (item.type === type && item.subtype === subtype) {
          const iconSVG = UI.NODE_ICONS[subtype] || item.icon;
          return { ...item, icon: iconSVG };
        }
      }
    }
    const fallbackIcon = UI.NODE_ICONS[subtype] || UI.NODE_ICONS[type] || 'HEX';
    return { icon: fallbackIcon, colorClass: 'node-color-source', label: subtype || type };
  }

  // ── Prompt suggestions ────────────────────────────────────────
  const PROMPT_SUGGESTIONS = [
    'If Age > 60 set Sex to female',
    'Map Country names to ISO codes',
    'Detect mobile operator from Phone',
    'Filter rows where Region = North',
    'Uppercase the Name column',
    'Remove +91 prefix from Phone',
    'Rename first_name to Name',
  ];

  // ── Init ──────────────────────────────────────────────────────
  function init(wfId) {
    workflowId = wfId;
    const wf = Storage.Workflows.get(wfId);
    if (!wf) { Router.navigate('admin'); return; }
    nodes = JSON.parse(JSON.stringify(wf.nodes || []));
    edges = JSON.parse(JSON.stringify(wf.edges || []));
    nodePositions = JSON.parse(JSON.stringify(wf.nodePositions || {}));
    uploadedData = wf.uploadedData ? JSON.parse(JSON.stringify(wf.uploadedData)) : null;
    if (uploadedData && (!uploadedData.types || typeof uploadedData.types !== 'object')) {
      uploadedData.types = detectColumnTypes(uploadedData.columns, uploadedData.rows);
    }
    selectedNodeId = null;
    selectedEdgeId = null;
    zoom = 1.0;
    panX = 0;
    panY = 0;
    isDirty = false;
    chatHistory = [];
    isChatLoading = false;
    // Start on Data tab if no file uploaded yet, else Nodes
    paletteTab = uploadedData ? 'nodes' : 'data';
    render(wf);
  }

  // ── Main Render ───────────────────────────────────────────────
  function render(wf) {
    document.getElementById('app-root').innerHTML = `
      <!-- Top Nav -->
      <nav class="top-nav">
        <a class="nav-logo" onclick="Router.navigate('admin')" style="cursor:pointer">
          <div class="nav-logo-icon">${UI.logoSVG}</div>
          <span class="nav-logo-text">DataFlow</span>
        </a>
        <div class="nav-center" style="gap:8px;font-size:13px;">
          <span style="color:var(--color-fog-veil);cursor:pointer;" onclick="Router.navigate('admin')">Workflows</span>
          <span style="color:var(--color-fog-veil);">/</span>
          <span style="color:var(--color-snow-sheet);">${escHtml(wf.name)}</span>
          <span id="dirty-dot" style="display:none;color:#fbbf24;" title="Unsaved">●</span>
        </div>
        <div class="nav-right">
          <button class="btn btn-sm btn-secondary" onclick="Canvas.undo()" title="Undo">Undo</button>
          <button class="btn btn-sm btn-secondary" onclick="Canvas.runWorkflow()" id="btn-run">Run</button>
          <button class="btn btn-sm btn-ghost" onclick="Canvas.saveWorkflow()">Save</button>
          <button class="btn btn-sm btn-primary" onclick="Canvas.publish()">Publish</button>
          <button class="btn btn-sm btn-secondary" onclick="Auth.logout()">Exit</button>
        </div>
      </nav>

      <!-- AI Prompt Bar -->
      <div class="prompt-bar">
        <span class="prompt-bar-icon">AI</span>
        <input class="prompt-input" id="prompt-input"
          placeholder='Describe your workflow... e.g. "If Age > 60 set Sex to female, map Country to ISO, export CSV"'
          onkeydown="if(event.key==='Enter') Canvas.generateFromPrompt()" />
        <div class="prompt-chips" id="prompt-chips">
          ${PROMPT_SUGGESTIONS.slice(0,4).map(s =>
            `<button class="prompt-chip" onclick="Canvas._setPrompt('${s}')">${s}</button>`
          ).join('')}
        </div>
        <button class="btn btn-sm btn-primary" onclick="Canvas.generateFromPrompt()" style="flex-shrink:0;">Generate</button>
      </div>

      <!-- Canvas Layout (3-column) -->
      <div class="canvas-layout canvas-layout-prompt">

        <!-- LEFT: Palette with tabs -->
        <div class="canvas-palette" style="width:260px;">
          <div class="palette-tab-strip">
            <button class="palette-tab-btn ${paletteTab==='data'?'active':''}" id="ptab-data" onclick="Canvas._switchPaletteTab('data')">Data</button>
            <button class="palette-tab-btn ${paletteTab==='nodes'?'active':''}" id="ptab-nodes" onclick="Canvas._switchPaletteTab('nodes')">Nodes</button>
            <button class="palette-tab-btn ${paletteTab==='ai'?'active':''}" id="ptab-ai" onclick="Canvas._switchPaletteTab('ai')">AI Chat</button>
          </div>

          <!-- NODES TAB -->
          <div id="palette-nodes-tab" class="${paletteTab==='nodes'?'':'hidden'}" style="display:${paletteTab==='nodes'?'flex':'none'};flex:1;flex-direction:column;overflow:hidden;">
            <div class="palette-body" style="flex:1;overflow-y:auto;">
              ${NODE_TYPES.map(sec => `
                <div class="palette-section-label">${sec.section}</div>
                ${sec.items.map(item => `
                  <div class="palette-node" draggable="true"
                    data-type="${item.type}" data-subtype="${item.subtype}"
                    ondragstart="Canvas._paletteDragStart(event)"
                    title="${item.desc}">
                    <div class="palette-node-icon ${item.colorClass}">${UI.NODE_ICONS[item.subtype] || UI.NODE_ICONS[item.type] || item.icon}</div>
                    <div class="palette-node-info">
                      <div class="palette-node-name">${item.label}</div>
                      <div class="palette-node-desc">${item.desc}</div>
                    </div>
                  </div>
                `).join('')}
              `).join('')}
            </div>
          </div>

          <!-- DATA TAB -->
          <div id="palette-data-tab" class="${paletteTab==='data'?'':'hidden'}" style="display:${paletteTab==='data'?'flex':'none'};flex:1;flex-direction:column;overflow:hidden;">
            <div class="data-panel">
              ${renderDataPanelHTML()}
            </div>
          </div>

          <!-- AI CHAT TAB -->
          <div id="palette-ai-tab" class="${paletteTab==='ai'?'':'hidden'}" style="display:${paletteTab==='ai'?'flex':'none'};flex:1;flex-direction:column;overflow:hidden;background:var(--surface-trench);">
            <div class="chat-history" id="chat-history" style="flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:12px;font-size:12px;line-height:1.5;">
              <div class="chat-message system" style="color:var(--color-fog-veil);font-style:italic;text-align:center;margin-top:20px;">
                Ask DataFlow AI to build, edit, or modify your workflow steps dynamically!
              </div>
            </div>
            <div class="chat-input-area" style="padding:8px;border-top:1px solid rgba(237,255,254,0.08);background:var(--surface-reef);display:flex;flex-direction:column;gap:8px;">
              <textarea class="form-input" id="chat-input" placeholder="Type AI instruction... (e.g. 'add column status')" style="resize:none;height:60px;font-size:12px;background:var(--surface-trench);border:1px solid rgba(237,255,254,0.08);border-radius:4px;color:var(--color-snow-sheet);" onkeydown="if(event.key==='Enter' && !event.shiftKey) { event.preventDefault(); Canvas.sendChatMessage(); }"></textarea>
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <button class="btn btn-xs btn-secondary" onclick="Canvas.clearChatHistory()" style="font-size:10px;">Clear</button>
                <button class="btn btn-xs btn-primary" onclick="Canvas.sendChatMessage()" style="font-size:10px;">Send ➔</button>
              </div>
            </div>
          </div>
        </div>

        <!-- CENTER: Canvas + Preview -->
        <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">

          <!-- Canvas Area -->
          <div class="canvas-area" id="canvas-area"
            ondragover="event.preventDefault()"
            ondrop="Canvas._drop(event)">

            <!-- Scroll Wrap -->
            <div class="canvas-scroll-wrap" id="canvas-scroll-wrap"
              onmousedown="Canvas._canvasMDown(event)"
              onmousemove="Canvas._canvasMMove(event)"
              onmouseup="Canvas._canvasMUp(event)"
              style="position: absolute; inset: 0; overflow: hidden; cursor: grab;">
              
              <div style="position: relative; width: 3000px; height: 2000px; background: var(--surface-abyss); background-image: radial-gradient(circle, rgba(0, 130, 124, 0.05) 1px, transparent 1px); background-size: 28px 28px;" id="canvas-workspace">
                <svg class="canvas-svg" id="canvas-svg" width="3000" height="2000" xmlns="http://www.w3.org/2000/svg" style="position: absolute; inset: 0; pointer-events: none; overflow: visible;">
                  <g id="edges-g"></g>
                  <path id="temp-edge" class="canvas-edge temp" style="display:none; stroke: var(--color-current-teal); stroke-width: 2px; fill: none;"/>
                </svg>

                <div class="canvas-nodes" id="canvas-nodes" style="position: absolute; inset: 0;"></div>
              </div>
            </div>

            <div id="canvas-hint" class="canvas-hint" style="${nodes.length>0?'display:none':''}; pointer-events: none;">
              ${!uploadedData
                ? 'Start by uploading a data file in the Data tab'
                : 'Drag nodes from the palette or use the AI prompt above'}
            </div>

            <!-- Toolbar -->
            <div class="canvas-toolbar">
              <button class="btn btn-sm btn-secondary" onclick="Canvas.clearCanvas()" title="Clear all">Clear</button>
              <div class="canvas-toolbar-sep"></div>
              <button class="btn btn-sm btn-secondary" onclick="Canvas.runWorkflow()">Run</button>
              <div class="canvas-toolbar-sep"></div>
              <span style="font-size:11px;color:var(--color-fog-veil);">
                <span id="node-count">${nodes.length}</span>N · <span id="edge-count">${edges.length}</span>E
              </span>
              <div class="canvas-toolbar-sep"></div>
              <button class="btn btn-sm btn-secondary" onclick="Canvas.shareLink()" title="Share Link">Share</button>
              <button class="btn btn-sm btn-secondary" onclick="Canvas.autoLayout()" title="Auto-arrange">Arrange</button>
            </div>

            <!-- Zoom Controls -->
            <div class="canvas-zoom-controls">
              <button class="btn btn-sm btn-secondary" onclick="Canvas.zoomOut()" title="Zoom Out">-</button>
              <span id="zoom-percentage" style="font-size:11px;color:var(--color-fog-veil);min-width:36px;text-align:center;user-select:none;">100%</span>
              <button class="btn btn-sm btn-secondary" onclick="Canvas.zoomIn()" title="Zoom In">+</button>
              <button class="btn btn-sm btn-secondary" onclick="Canvas.zoomReset()" title="Reset Zoom">1:1</button>
            </div>
          </div>

          <!-- Preview Panel (bottom, dual tabs) -->
          <div class="preview-panel-new">
            <div class="preview-header-new">
              <div class="preview-tab-strip">
                <button class="preview-tab-btn ${previewTab==='original'?'active':''}" id="pvtab-original" onclick="Canvas._switchPreviewTab('original')">Original Data</button>
                <button class="preview-tab-btn ${previewTab==='transformed'?'active':''}" id="pvtab-transformed" onclick="Canvas._switchPreviewTab('transformed')">After Workflow</button>
              </div>
              <div style="display:flex;gap:8px;align-items:center;">
                <span id="preview-info" style="font-size:11px;color:var(--color-fog-veil);"></span>
                <button class="btn btn-sm btn-secondary" onclick="Canvas.runWorkflow()">Run</button>
                <button class="btn btn-sm btn-secondary" onclick="Canvas.downloadOutput('csv')">CSV</button>
                <button class="btn btn-sm btn-secondary" onclick="Canvas.downloadOutput('json')">JSON</button>
              </div>
            </div>
            <div class="preview-body-new">
              <div id="preview-original">${renderOriginalPreviewHTML()}</div>
              <div id="preview-transformed" class="${previewTab==='transformed'?'':'hidden'}">
                <div class="preview-empty">Run the workflow to see transformed output</div>
              </div>
            </div>
          </div>
        </div>

        <!-- RIGHT: Config Panel -->
        <div class="config-panel" style="width:300px;">
          <div class="config-panel-header">
            <span class="config-panel-title" id="config-panel-title">Node Properties</span>
            <button class="btn btn-icon btn-secondary" onclick="Canvas.deselectNode()">✕</button>
          </div>
          <div class="config-panel-body" id="config-panel-body">
            <div class="config-panel-empty">
              <div style="width:32px;height:32px;opacity:0.3;margin-bottom:12px;">${UI.logoSVG}</div>
              <span>Select a node to configure it</span>
            </div>
          </div>
          <div class="config-panel-footer" id="config-panel-footer" style="display:none">
            <button class="btn btn-sm btn-danger" onclick="Canvas.deleteSelectedNode()" style="flex:1">Delete</button>
            <button class="btn btn-sm btn-primary" onclick="Canvas.applyNodeConfig()" style="flex:1">Apply</button>
          </div>
        </div>
      </div>

      <div class="toast-container" id="toast-container"></div>

      <!-- Share Modal (standalone) -->
      <div class="modal-backdrop" id="modal-share">
        <div class="modal">
          <div class="modal-header">
            <span class="modal-title">Share Workflow</span>
            <button class="modal-close" onclick="UI.closeModal('modal-share')">✕</button>
          </div>
          <div class="modal-body">
            <p style="color:var(--color-fog-veil);margin-bottom:var(--spacing-20);">Share this link — viewers can see & run the workflow without logging in.</p>
            <div class="share-box">
              <input class="share-box-url" id="share-url" readonly value=""/>
              <button class="btn btn-sm btn-primary" onclick="Canvas._copyShare()">Copy</button>
            </div>
            <div style="margin-top:16px;"><button class="btn btn-sm btn-secondary" onclick="window.open(document.getElementById('share-url').value,'_blank')">Open</button></div>
          </div>
        </div>
      </div>
    `;

    renderNodes();
    renderEdges();

    const scrollWrap = document.getElementById('canvas-scroll-wrap');
    if (scrollWrap) {
      scrollWrap.addEventListener('wheel', e => {
        e.preventDefault();
        const zoomFactor = 1.1;
        let nextZoom;
        if (e.deltaY < 0) {
          nextZoom = Math.min(2.5, zoom * zoomFactor);
        } else {
          nextZoom = Math.max(0.4, zoom / zoomFactor);
        }

        const rect = scrollWrap.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const localX = (mouseX - panX) / zoom;
        const localY = (mouseY - panY) / zoom;

        zoom = nextZoom;
        
        panX = mouseX - localX * zoom;
        panY = mouseY - localY * zoom;

        updateWorkspaceTransform();
      }, { passive: false });
    }
    updateWorkspaceTransform();
  }

  // ── Data Panel HTML ───────────────────────────────────────────
  function renderDataPanelHTML() {
    if (!uploadedData) {
      return `
        <div class="file-drop-zone" id="file-drop-zone"
          ondragover="event.preventDefault();this.classList.add('drag-over')"
          ondragleave="this.classList.remove('drag-over')"
          ondrop="Canvas._fileDrop(event)">
          <input type="file" accept=".csv,.json,.txt" onchange="Canvas._fileInputChange(event)"/>
          <div class="fdz-icon">FILE</div>
          <div class="fdz-title">Upload Data File</div>
          <div class="fdz-sub">CSV · JSON · TXT — drag here or click</div>
        </div>
        <div style="padding:12px;color:rgba(187,199,198,0.3);font-size:11px;text-align:center;line-height:1.6;">
          Upload a file to:<br>
          • See your data preview<br>
          • Drag columns to canvas<br>
          • Use AI prompt to transform
        </div>
      `;
    }

    const { columns, rows, fileName, fileType } = uploadedData;
    const colTypes = uploadedData.types || detectColumnTypes(columns, rows);
    const preview = rows.slice(0, 5);
    const typeIcon = { csv:'CSV', json:'JSON', txt:'TXT' }[fileType] || 'File';

    return `
      <div class="file-info-bar">
        <span class="fib-icon">${typeIcon}</span>
        <div>
          <div class="fib-name">${escHtml(fileName)}</div>
          <div class="fib-meta">${rows.length} rows · ${columns.length} cols</div>
        </div>
        <button class="fib-del" onclick="Canvas.clearFile()" title="Remove file">✕</button>
      </div>

      <div class="data-panel-scroll">
        <div class="dp-section-label">Preview</div>
        <div class="mini-preview-wrap">
          <table class="mini-table">
            <thead><tr>${columns.slice(0,6).map(c => `<th title="${escHtml(c)}">${escHtml(c.length>8?c.slice(0,7)+'…':c)}</th>`).join('')}${columns.length>6?'<th>…</th>':''}</tr></thead>
            <tbody>
              ${preview.map(row => `<tr>${columns.slice(0,6).map(c => `<td>${escHtml(String(row[c]??''))}</td>`).join('')}${columns.length>6?'<td>…</td>':''}</tr>`).join('')}
            </tbody>
          </table>
        </div>

        <div class="dp-section-label">Columns <span style="color:rgba(187,199,198,0.3);font-size:9px;letter-spacing:0">(drag to canvas)</span></div>
        <div class="columns-chips-wrap">
          ${columns.map(col => {
            const t = colTypes[col] || 'other';
            return `<div class="col-chip" draggable="true"
              ondragstart="Canvas._colChipDragStart(event,'${escHtml(col)}','${t}')"
              title="Drag to canvas · type: ${t}">
              <div class="col-chip-dot ctype-${t}"></div>
              <span class="col-chip-name">${escHtml(col)}</span>
              <span class="col-chip-type">${t}</span>
              <span class="col-chip-drag-hint">⠿</span>
            </div>`;
          }).join('')}
        </div>


        <div style="padding:8px 12px 12px;">
          <button class="btn btn-sm btn-secondary" onclick="Canvas._addAllAsSource()" style="width:100%;font-size:11px;">
            Add as Source Node
          </button>
        </div>
      </div>
    `;
  }

  // ── Original preview HTML ─────────────────────────────────────
  function renderOriginalPreviewHTML() {
    if (!uploadedData) {
      return `<div class="preview-empty">Upload a file to see original data</div>`;
    }
    const { columns, rows } = uploadedData;
    const preview = rows.slice(0, 15);
    return `
      <table class="data-table">
        <thead><tr>${columns.map(c => `<th>${escHtml(c)}</th>`).join('')}</tr></thead>
        <tbody>${preview.map(row =>
          `<tr>${columns.map(c => {
            const v = row[c];
            return `<td>${v===''||v===null||v===undefined?'<span class="null-cell">null</span>':escHtml(String(v))}</td>`;
          }).join('')}</tr>`
        ).join('')}</tbody>
      </table>
    `;
  }

  // ── File handling ─────────────────────────────────────────────
  function _fileDrop(e) {
    e.preventDefault();
    document.getElementById('file-drop-zone')?.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }

  function _fileInputChange(e) {
    const file = e.target.files[0];
    if (file) handleFileUpload(file);
  }

  function handleFileUpload(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      let columns = [], rows = [];

      try {
        if (ext === 'json') {
          const data = JSON.parse(text);
          const arr = Array.isArray(data) ? data : (data.data || data.rows || data.items || Object.values(data)[0]);
          if (arr && arr.length) {
            columns = Object.keys(arr[0]);
            rows = arr;
          }
        } else {
          // CSV / TXT
          const parsed = Engine.parseCSV(text);
          columns = parsed.columns;
          rows = parsed.rows;
        }
      } catch(err) {
        UI.toast('Failed to parse file: ' + err.message, 'error');
        return;
      }

      if (!columns.length) { UI.toast('No columns detected in file', 'error'); return; }

      const types = detectColumnTypes(columns, rows);
      uploadedData = { columns, rows, types, fileName: file.name, fileType: ext };

      // Save to workflow
      const wf = Storage.Workflows.get(workflowId);
      if (wf) {
        wf.uploadedData = uploadedData;
        Storage.Workflows.saveRaw(wf);
      }

      // Refresh data panel
      paletteTab = 'data';
      refreshDataPanel();
      refreshOriginalPreview();
      UI.toast(`✓ ${file.name} — ${rows.length} rows, ${columns.length} columns`, 'success');
    };
    reader.readAsText(file);
  }

  function detectColumnTypes(columns, rows) {
    const types = {};
    const sample = rows.slice(0, 30);
    for (const col of columns) {
      const vals = sample.map(r => r[col]).filter(v => v !== '' && v !== null && v !== undefined);
      if (!vals.length) { types[col] = 'string'; continue; }
      if (vals.every(v => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v)))) { types[col] = 'email'; continue; }
      if (vals.every(v => /^[\+0-9][0-9\-\s()]+$/.test(String(v)) && String(v).length >= 7)) { types[col] = 'phone'; continue; }
      if (vals.every(v => !isNaN(parseFloat(v)) && isFinite(Number(v)))) { types[col] = 'number'; continue; }
      if (vals.every(v => !isNaN(Date.parse(String(v))) && isNaN(Number(v)) && String(v).length > 4)) { types[col] = 'date'; continue; }
      if (vals.every(v => ['true','false','yes','no','0','1'].includes(String(v).toLowerCase()))) { types[col] = 'boolean'; continue; }
      types[col] = 'string';
    }
    return types;
  }

  function clearFile() {
    uploadedData = null;
    const wf = Storage.Workflows.get(workflowId);
    if (wf) { delete wf.uploadedData; Storage.Workflows.saveRaw(wf); }
    refreshDataPanel();
    refreshOriginalPreview();
    UI.toast('File removed', 'info');
  }

  function refreshDataPanel() {
    const nodesTab = document.getElementById('palette-nodes-tab');
    const dataTab = document.getElementById('palette-data-tab');
    const ptabNodes = document.getElementById('ptab-nodes');
    const ptabData = document.getElementById('ptab-data');

    // Update data panel content
    const dp = dataTab?.querySelector('.data-panel');
    if (dp) dp.innerHTML = renderDataPanelHTML();

    // Switch to active tab style and visibility
    if (paletteTab === 'data') {
      if (dataTab) dataTab.style.display = 'flex';
      if (nodesTab) nodesTab.style.display = 'none';
      ptabData?.classList.add('active');
      ptabNodes?.classList.remove('active');
    } else {
      if (dataTab) dataTab.style.display = 'none';
      if (nodesTab) nodesTab.style.display = 'flex';
      ptabData?.classList.remove('active');
      ptabNodes?.classList.add('active');
    }

    // Update hint
    const hint = document.getElementById('canvas-hint');
    if (hint && nodes.length === 0) {
      hint.innerHTML = uploadedData
        ? 'Drag nodes from palette or use the AI prompt above'
        : 'Start by uploading a data file in the Data tab';
    }
  }

  function refreshOriginalPreview() {
    const el = document.getElementById('preview-original');
    if (el) el.innerHTML = renderOriginalPreviewHTML();
  }

  // ── Column chip drag ──────────────────────────────────────────
  function _colChipDragStart(e, colName, colType) {
    e.dataTransfer.setData('text/plain', JSON.stringify({
      action: 'column-chip',
      columnName: colName,
      columnType: colType,
    }));
    e.dataTransfer.effectAllowed = 'copy';
  }

  function _addNodeFromColumn(colName, colType, x, y) {
    let type = 'transform', subtype = 'text_transform', config = { subtype: 'text_transform', column: colName, operation: 'trim' };
    let label = `Transform ${colName}`;

    // Smart defaults based on column name/type
    if (/dob|birth|birthday|born/i.test(colName) || colType === 'date') {
      subtype = 'add_column'; label = 'Add Age from ' + colName;
      config = { subtype: 'add_column', targetColumn: 'Age', formula: `datediff(${colName})`, sourceColumn: colName };
    } else if (/country|nation|state/i.test(colName)) {
      subtype = 'lookup_map'; label = `${colName} → ISO Code`;
      config = { subtype: 'lookup_map', sourceColumn: colName, targetColumn: colName+'Code',
        map: { India:'IND', INDIA:'IND', USA:'USA', 'United States':'USA', Germany:'DEU', UK:'GBR', 'United Kingdom':'GBR', France:'FRA', China:'CHN', Japan:'JPN', Australia:'AUS', Canada:'CAN' }
      };
    } else if (/phone|mobile|cell/i.test(colName) || colType === 'phone') {
      subtype = 'add_column'; label = `${colName} → Operator`;
      config = { subtype: 'add_column', targetColumn: 'Operator', formula: `operator(${colName})`, sourceColumn: colName };
    } else if (colType === 'number') {
      subtype = 'add_column'; label = `Formula on ${colName}`;
      config = { subtype: 'add_column', targetColumn: colName+'_calc', formula: `{${colName}} * 1`, sourceColumn: colName };
    } else if (colType === 'string') {
      subtype = 'text_transform'; label = `Clean ${colName}`;
      config = { subtype: 'text_transform', column: colName, operation: 'trim' };
    }

    // Ensure source node exists and connect it
    let sourceNode = nodes.find(n => n.type === 'source');
    if (!sourceNode && uploadedData) {
      sourceNode = addNode('source', 'csv', 40, y, {
        subtype: 'csv',
        csvText: [uploadedData.columns.join(','), ...uploadedData.rows.slice(0,5).map(r => uploadedData.columns.map(c => r[c]??'').join(','))].join('\n'),
      }, `${uploadedData.fileName}`);
    }

    const n = addNode(type, subtype, x, y, config, label);

    if (sourceNode) {
      let lastNodeId = sourceNode.id;
      if (nodes.length > 2) {
        const rightmost = nodes.reduce((best, nodeItem) => {
          if (!best) return nodeItem;
          if (nodeItem.id === n.id || nodeItem.type === 'output') return best;
          const bx = nodePositions[best.id]?.x || 0;
          const nx = nodePositions[nodeItem.id]?.x || 0;
          return nx > bx ? nodeItem : best;
        }, null);
        if (rightmost) {
          lastNodeId = rightmost.id;
        }
      }
      edges.push({ id: 'e' + Storage.uid(), from: lastNodeId, to: n.id });
      markDirty();
      renderEdges();
    }
  }

  // ── Add node (enhanced with config + label override) ──────────
  function addNode(type, subtype, x, y, preConfig = {}, labelOverride = null) {
    pushHistory();
    const info = getTypeInfo(type, subtype);
    const id = 'n' + Storage.uid();
    const node = {
      id, type, subtype,
      label: labelOverride || info.label,
      config: { subtype, ...preConfig },
    };
    nodes.push(node);
    nodePositions[id] = { x: Math.max(10, x), y: Math.max(10, y) };
    markDirty();
    renderNodes();
    renderEdges();
    selectNode(id);
    return node;
  }

  // ── Auto-layout ───────────────────────────────────────────────
  function autoLayout() {
    if (!nodes.length) return;
    pushHistory();
    layoutTopologically();
    renderNodes();
    renderEdges();
    markDirty();
  }

  // ── Add all columns as a source node ─────────────────────────
  function _addAllAsSource() {
    if (!uploadedData) return;
    // Check if source node already exists
    const existing = nodes.find(n => n.type === 'source' && n.subtype === 'csv');
    if (existing) { UI.toast('Source node already on canvas', 'info'); selectNode(existing.id); return; }
    const node = addNode('source', 'csv', 40, 60, {
      subtype: 'csv',
      csvText: [uploadedData.columns.join(','), ...uploadedData.rows.slice(0,5).map(r => uploadedData.columns.map(c => r[c]??'').join(','))].join('\n'),
    }, `${uploadedData.fileName}`);
    UI.toast('Source node added to canvas', 'success');
    return node;
  }

  function _switchPaletteTab(tab) {
    paletteTab = tab;
    const nodesTab = document.getElementById('palette-nodes-tab');
    const dataTab = document.getElementById('palette-data-tab');
    const aiTab = document.getElementById('palette-ai-tab');
    if (!nodesTab || !dataTab || !aiTab) return;
    
    // Hide all
    nodesTab.style.display = 'none'; nodesTab.classList.add('hidden');
    dataTab.style.display = 'none'; dataTab.classList.add('hidden');
    aiTab.style.display = 'none'; aiTab.classList.add('hidden');
    
    document.getElementById('ptab-nodes')?.classList.remove('active');
    document.getElementById('ptab-data')?.classList.remove('active');
    document.getElementById('ptab-ai')?.classList.remove('active');
    
    if (tab === 'nodes') {
      nodesTab.style.display = 'flex'; nodesTab.classList.remove('hidden');
      document.getElementById('ptab-nodes')?.classList.add('active');
    } else if (tab === 'data') {
      dataTab.style.display = 'flex'; dataTab.classList.remove('hidden');
      document.getElementById('ptab-data')?.classList.add('active');
      refreshDataPanel();
    } else if (tab === 'ai') {
      aiTab.style.display = 'flex'; aiTab.classList.remove('hidden');
      document.getElementById('ptab-ai')?.classList.add('active');
      renderChatHistory();
    }
  }

  function _switchPreviewTab(tab) {
    previewTab = tab;
    const orig = document.getElementById('preview-original');
    const trans = document.getElementById('preview-transformed');
    const btnO = document.getElementById('pvtab-original');
    const btnT = document.getElementById('pvtab-transformed');
    if (tab === 'original') {
      orig?.classList.remove('hidden'); trans?.classList.add('hidden');
      btnO?.classList.add('active'); btnT?.classList.remove('active');
    } else {
      trans?.classList.remove('hidden'); orig?.classList.add('hidden');
      btnT?.classList.add('active'); btnO?.classList.remove('active');
    }
  }

  function generateFromPrompt() {
    const text = document.getElementById('prompt-input')?.value?.trim();
    if (!text) { UI.toast('Please type what you want to do', 'error'); return; }
    
    // Auto-switch to AI tab
    _switchPaletteTab('ai');
    
    // Clear the top prompt bar input
    const inp = document.getElementById('prompt-input');
    if (inp) inp.value = '';
    
    // Send message
    sendChatMessage(text);
  }

  function _setPrompt(text) {
    const inp = document.getElementById('prompt-input');
    if (inp) inp.value = text;
  }

  async function sendChatMessage(overrideText = null) {
    const inputEl = document.getElementById('chat-input');
    const text = overrideText || inputEl?.value?.trim();
    if (!text) return;
    
    if (inputEl) inputEl.value = '';
    
    chatHistory.push({ role: 'user', content: text });
    renderChatHistory();
    
    isChatLoading = true;
    renderChatHistory();
    
    try {
      // Pass all nodes (with IDs) and edges for full DAG context
      const currentNodes = nodes.map(n => ({
        id: n.id,
        type: n.type,
        subtype: n.subtype,
        label: n.label,
        config: n.config
      }));
      const currentEdges = edges.map(e => ({
        from: e.from,
        to: e.to
      }));
      
      const cols = uploadedData ? uploadedData.columns : [];
      const response = await Engine.parsePrompt(text, cols, currentNodes, chatHistory, true, currentEdges);
      
      isChatLoading = false;
      
      let explanation = 'Workflow updated successfully.';
      let newNodes = null;

      if (response) {
        if (response.nodes && Array.isArray(response.nodes)) {
          explanation = response.explanation || explanation;
          newNodes = response.nodes;
        } else if (Array.isArray(response)) {
          newNodes = response;
        } else if (response.type || response.subtype) {
          newNodes = [response];
        }
      }

      if (newNodes) {
        chatHistory.push({ role: 'model', content: explanation });
        updateWorkflowWithNodes(newNodes, response ? response.edges : null);
        UI.toast('Workflow updated successfully!', 'success');
      } else {
        chatHistory.push({ role: 'model', content: 'Sorry, I couldn\'t compile the workflow changes. Please try a different instruction.' });
        UI.toast('Failed to update workflow', 'error');
      }
    } catch (e) {
      isChatLoading = false;
      chatHistory.push({ role: 'model', content: `Error: ${e.message}` });
      UI.toast(e.message, 'error');
    }
    
    renderChatHistory();
  }

  function renderChatHistory() {
    const histEl = document.getElementById('chat-history');
    if (!histEl) return;
    
    if (chatHistory.length === 0) {
      histEl.innerHTML = `
        <div class="chat-message system" style="color:var(--color-fog-veil);font-style:italic;text-align:center;margin-top:20px;">
          Ask DataFlow AI to build, edit, or modify your workflow steps dynamically!
        </div>
      `;
      return;
    }
    
    let html = `
      <style>
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1.0); }
        }
      </style>
    `;
    
    chatHistory.forEach(msg => {
      if (msg.role === 'user') {
        html += `
          <div class="chat-message user" style="align-self: flex-end; background: rgba(0, 130, 124, 0.15); border: 1px solid rgba(0, 130, 124, 0.3); border-radius: 8px 8px 0 8px; padding: 8px 12px; max-width: 85%; color: var(--color-snow-sheet); word-break: break-word;">
            ${escHtml(msg.content)}
          </div>
        `;
      } else {
        html += `
          <div class="chat-message model" style="align-self: flex-start; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(237, 255, 254, 0.08); border-radius: 8px 8px 8px 0; padding: 8px 12px; max-width: 85%; color: var(--color-ice-mist); word-break: break-word;">
            <div style="font-weight: 500; font-size: 10px; color: var(--color-current-teal); margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
              <span>✦</span><span>DATAFLOW AI</span>
            </div>
            ${escHtml(msg.content)}
          </div>
        `;
      }
    });
    
    if (isChatLoading) {
      html += `
        <div class="chat-message model loading" style="align-self: flex-start; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(237, 255, 254, 0.08); border-radius: 8px 8px 8px 0; padding: 8px 12px; width: 60px; color: var(--color-ice-mist); display: flex; gap: 4px; justify-content: center; align-items: center;">
          <span class="spinner-dot" style="width: 6px; height: 6px; background-color: var(--color-current-teal); border-radius: 50%; display: inline-block; animation: bounce 1.4s infinite ease-in-out both; animation-delay: -0.32s;"></span>
          <span class="spinner-dot" style="width: 6px; height: 6px; background-color: var(--color-current-teal); border-radius: 50%; display: inline-block; animation: bounce 1.4s infinite ease-in-out both; animation-delay: -0.16s;"></span>
          <span class="spinner-dot" style="width: 6px; height: 6px; background-color: var(--color-current-teal); border-radius: 50%; display: inline-block; animation: bounce 1.4s infinite ease-in-out both;"></span>
        </div>
      `;
    }
    
    histEl.innerHTML = html;
    histEl.scrollTop = histEl.scrollHeight;
  }

  function clearChatHistory() {
    chatHistory = [];
    renderChatHistory();
  }

  function updateWorkflowWithNodes(newNodesList, newEdgesList = null) {
    pushHistory();

    const hasSource = newNodesList.some(n => n.type === 'source');
    const hasOutput = newNodesList.some(n => n.type === 'output');

    let finalNodes = [];
    let finalEdges = [];

    if (hasSource && hasOutput && newEdgesList) {
      // Branching DAG case!
      const currentNodes = [...nodes];
      const unmatched = [...currentNodes];
      const idMap = {};

      finalNodes = newNodesList.map(ns => {
        let matchIdx = -1;
        // Prioritize exact ID match if preserved by the model
        if (ns.id) {
          matchIdx = unmatched.findIndex(c => c.id === ns.id);
        }
        if (matchIdx === -1) {
          if (ns.type === 'source') {
            matchIdx = unmatched.findIndex(c => c.type === 'source');
          } else if (ns.type === 'output') {
            matchIdx = unmatched.findIndex(c => c.type === 'output');
          } else {
            matchIdx = unmatched.findIndex(c => c.type !== 'source' && c.type !== 'output' && c.subtype === ns.subtype);
          }
        }

        let matchedNode = null;
        if (matchIdx !== -1) {
          matchedNode = unmatched.splice(matchIdx, 1)[0];
        }

        const id = matchedNode ? matchedNode.id : 'n' + Storage.uid();
        idMap[ns.id] = id;

        return {
          id,
          type: ns.type || 'transform',
          subtype: ns.subtype,
          label: ns.label || ns.config?.targetColumn || 'Transform',
          config: ns.config || {}
        };
      });

      newEdgesList.forEach(e => {
        const fromFinal = idMap[e.from];
        const toFinal = idMap[e.to];
        if (fromFinal && toFinal) {
          finalEdges.push({
            id: 'e' + Storage.uid(),
            from: fromFinal,
            to: toFinal
          });
        }
      });
      
      nodes = finalNodes;
      edges = finalEdges;

      const currentIds = new Set(nodes.map(n => n.id));
      Object.keys(nodePositions).forEach(k => {
        if (!currentIds.has(k)) {
          delete nodePositions[k];
        }
      });

      layoutTopologically();

    } else {
      // Linear fallback case (intermediate nodes list only)
      let sourceNode = nodes.find(n => n.type === 'source');
      if (!sourceNode && uploadedData) {
        const id = 'n' + Storage.uid();
        sourceNode = {
          id,
          type: 'source',
          subtype: 'csv',
          label: uploadedData.fileName || 'CSV Source',
          config: {
            subtype: 'csv',
            csvText: [uploadedData.columns.join(','), ...uploadedData.rows.slice(0,5).map(r => uploadedData.columns.map(c => r[c]??'').join(','))].join('\n'),
          }
        };
      }

      let outputNode = nodes.find(n => n.type === 'output');
      if (!outputNode) {
        const id = 'n' + Storage.uid();
        outputNode = {
          id,
          type: 'output',
          subtype: 'csv',
          label: 'CSV Export',
          config: { subtype: 'csv', filename: 'output.csv' }
        };
      }

      const currentIntermediate = nodes.filter(n => n.type !== 'source' && n.type !== 'output');
      const unmatched = [...currentIntermediate];

      const processedIntermediateNodes = newNodesList.map(ns => {
        const matchIdx = unmatched.findIndex(c => c.subtype === ns.subtype);
        let matchedNode = null;
        if (matchIdx !== -1) {
          matchedNode = unmatched.splice(matchIdx, 1)[0];
        }
        const id = matchedNode ? matchedNode.id : 'n' + Storage.uid();
        return {
          id,
          type: ns.type || 'transform',
          subtype: ns.subtype,
          label: ns.label || ns.config?.targetColumn || 'Transform',
          config: ns.config || {}
        };
      });

      const currentIds = new Set([
        ...(sourceNode ? [sourceNode.id] : []),
        ...processedIntermediateNodes.map(n => n.id),
        ...(outputNode ? [outputNode.id] : [])
      ]);
      Object.keys(nodePositions).forEach(k => {
        if (!currentIds.has(k)) {
          delete nodePositions[k];
        }
      });

      nodes = [];
      if (sourceNode) nodes.push(sourceNode);
      processedIntermediateNodes.forEach(n => nodes.push(n));
      if (outputNode) nodes.push(outputNode);

      edges = [];
      for (let i = 0; i < nodes.length - 1; i++) {
        edges.push({
          id: 'e' + Storage.uid(),
          from: nodes[i].id,
          to: nodes[i+1].id
        });
      }

      let startX = 40, startY = 80;
      nodes.forEach((n, i) => {
        if (nodePositions[n.id]) return;
        if (i > 0) {
          const predId = nodes[i - 1].id;
          const predPos = nodePositions[predId] || { x: startX + (i - 1) * 220, y: startY };
          nodePositions[n.id] = { x: predPos.x + 220, y: predPos.y };
        } else {
          nodePositions[n.id] = { x: startX, y: startY };
        }
      });
    }

    markDirty();
    renderNodes();
    renderEdges();
  }

  function layoutTopologically() {
    if (!nodes.length) return;

    const level = {};
    const inDegree = {};
    const adj = {};

    nodes.forEach(n => {
      level[n.id] = 0;
      inDegree[n.id] = 0;
      adj[n.id] = [];
    });

    edges.forEach(e => {
      if (adj[e.from]) adj[e.from].push(e.to);
      if (inDegree[e.to] !== undefined) inDegree[e.to]++;
    });

    const queue = nodes.filter(n => inDegree[n.id] === 0);
    queue.forEach(n => level[n.id] = 0);

    const order = [];
    const visited = new Set();

    while (queue.length) {
      const curr = queue.shift();
      if (visited.has(curr.id)) continue;
      visited.add(curr.id);
      order.push(curr);

      const currLevel = level[curr.id];
      adj[curr.id].forEach(toId => {
        level[toId] = Math.max(level[toId] || 0, currLevel + 1);
        inDegree[toId]--;
        if (inDegree[toId] === 0) {
          const nextNode = nodes.find(n => n.id === toId);
          if (nextNode) queue.push(nextNode);
        }
      });
    }

    nodes.forEach(n => {
      if (!visited.has(n.id)) {
        level[n.id] = 0;
      }
    });

    const nodesByLevel = {};
    nodes.forEach(n => {
      const lvl = level[n.id] || 0;
      if (!nodesByLevel[lvl]) nodesByLevel[lvl] = [];
      nodesByLevel[lvl].push(n);
    });

    const startX = 40;
    const startY = 160; 
    const spacingX = 220;
    const spacingY = 130;

    Object.keys(nodesByLevel).sort((a, b) => a - b).forEach(lvl => {
      const levelNodes = nodesByLevel[lvl];
      const count = levelNodes.length;
      levelNodes.forEach((n, idx) => {
        const offset = (idx - (count - 1) / 2) * spacingY;
        nodePositions[n.id] = {
          x: startX + lvl * spacingX,
          y: startY + offset
        };
      });
    });
  }

  // ── Render nodes ──────────────────────────────────────────────
  function renderNodes(animateNew = false) {
    const container = document.getElementById('canvas-nodes');
    if (!container) return;
    const existingIds = new Set([...container.querySelectorAll('.canvas-node')].map(el => el.id.replace('node-', '')));
    container.innerHTML = '';

    nodes.forEach(node => {
      const pos = nodePositions[node.id] || { x: 60, y: 80 };
      const info = getTypeInfo(node.type, node.subtype || node.config?.subtype);
      const isSelected = node.id === selectedNodeId;
      const isNew = animateNew && !existingIds.has(node.id);

      const el = document.createElement('div');
      el.className = `canvas-node${isSelected ? ' selected' : ''}${isNew ? ' node-new' : ''}`;
      el.id = `node-${node.id}`;
      el.style.left = pos.x + 'px';
      el.style.top = pos.y + 'px';

      el.innerHTML = `
        <div class="canvas-node-ports input-ports">
          ${node.type !== 'source' ? `<div class="port" data-node="${node.id}" data-port="input" onmousedown="Canvas._portMDown(event,'${node.id}','input')" onmouseup="Canvas._portMUp(event,'${node.id}','input')" onclick="Canvas._portClick(event,'${node.id}','input')"></div>` : ''}
        </div>
        <div class="canvas-node-header">
          <div class="canvas-node-icon ${info.colorClass}">${info.icon}</div>
          <div class="canvas-node-title">${escHtml(node.label)}</div>
          <div class="node-status ${getNodeStatus(node)}"></div>
        </div>
        <div class="canvas-node-body">
          <div class="canvas-node-detail">${getNodeSummary(node)}</div>
        </div>
        <div class="canvas-node-ports output-ports">
          ${node.type !== 'output' ? `<div class="port" data-node="${node.id}" data-port="output" onmousedown="Canvas._portMDown(event,'${node.id}','output')" onmouseup="Canvas._portMUp(event,'${node.id}','output')" onclick="Canvas._portClick(event,'${node.id}','output')"></div>` : ''}
        </div>
      `;

      el.addEventListener('mousedown', e => { if (e.target.classList.contains('port')) return; e.stopPropagation(); Canvas._nodeMDown(e, node.id); });
      el.addEventListener('click', e => { if (e.target.classList.contains('port')) return; Canvas.selectNode(node.id); });
      container.appendChild(el);
    });

    updateCounts();
  }

  function getNodeStatus(node) {
    if (!node.config || Object.keys(node.config).length <= 1) return 'node-status-warn';
    return 'node-status-ok';
  }

  function getNodeSummary(node) {
    const c = node.config || {};
    switch (node.subtype || node.type) {
      case 'csv':     return c.csvText ? `${c.csvText.split('\n').length - 1} rows` : (uploadedData ? uploadedData.fileName : 'No data');
      case 'json':    return c.jsonText ? 'JSON loaded' : 'No data';
      case 'api':     return c.url ? escHtml(c.url.slice(0,28)) : 'No URL';
      case 'add_column':    return c.targetColumn ? `→ ${escHtml(c.targetColumn)}` : 'Not configured';
      case 'rename_column': return c.renames ? Object.keys(c.renames).join(', ').slice(0,20) : 'Not configured';
      case 'delete_column': return c.columns?.length ? c.columns.join(', ').slice(0,20) : 'Not configured';
      case 'lookup_map':    return c.sourceColumn ? `${escHtml(c.sourceColumn)} → ${escHtml(c.targetColumn||'?')}` : 'Not configured';
      case 'row_filter':    return c.column ? `${escHtml(c.column)} ${c.operator||'='} ${escHtml(c.value||'')}` : 'Not configured';
      case 'text_transform':return c.column ? `${c.operation||'?'} on ${escHtml(c.column)}` : 'Not configured';
      case 'replace_value': return c.column ? `In ${escHtml(c.column)}` : 'Not configured';
      case 'mapping':       return c.mappings ? `${c.mappings.length} fields mapped` : 'Not configured';
      case 'rule_engine':   return c.rules ? `${c.rules.length} rules (${c.groupOp || 'AND'})` : 'Not configured';
      default: return c.filename || '';
    }
  }

  function updateCounts() {
    const nc = document.getElementById('node-count');
    const ec = document.getElementById('edge-count');
    if (nc) nc.textContent = nodes.length;
    if (ec) ec.textContent = edges.length;
    const hint = document.getElementById('canvas-hint');
    if (hint) hint.style.display = nodes.length > 0 ? 'none' : '';
  }

  // ── Render edges ──────────────────────────────────────────────
  function renderEdges() {
    const g = document.getElementById('edges-g');
    if (!g) return;
    g.innerHTML = '';
    edges.forEach(edge => {
      const fp = nodePositions[edge.from];
      const tp = nodePositions[edge.to];
      if (!fp || !tp) return;

      const x1 = fp.x + 180, y1 = fp.y + 40;
      const x2 = tp.x,       y2 = tp.y + 40;

      // Curve ends 6px before the port center
      const x2_curve = x2 - 6;
      const cx1 = x1 + Math.abs(x2 - x1) * 0.45;
      const cx2 = x2 - Math.abs(x2 - x1) * 0.45;
      const pathStr = `M${x1},${y1} C${cx1},${y1} ${cx2},${y2} ${x2_curve},${y2}`;

      const isSelected = edge.id === selectedEdgeId;
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      el.setAttribute('d', pathStr);
      el.setAttribute('class', 'canvas-edge edge-animated' + (isSelected ? ' selected' : ''));
      el.dataset.edgeId = edge.id;
      g.appendChild(el);

      // Thick invisible path for easy clicking/selecting
      const clickTarget = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      clickTarget.setAttribute('d', pathStr);
      clickTarget.setAttribute('stroke', 'rgba(255, 255, 255, 0.01)');
      clickTarget.setAttribute('stroke-width', '14');
      clickTarget.setAttribute('fill', 'none');
      clickTarget.setAttribute('class', 'edge-click-target');
      clickTarget.addEventListener('click', e => {
        e.stopPropagation();
        selectEdge(edge.id);
      });
      g.appendChild(clickTarget);

      // Clean polygon arrowhead pointing right
      const arrowEl = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      const points = `${x2},${y2} ${x2-8},${y2-4} ${x2-8},${y2+4}`;
      arrowEl.setAttribute('points', points);
      arrowEl.setAttribute('fill', isSelected ? '#22d3ee' : 'var(--color-current-teal)');
      arrowEl.setAttribute('opacity', isSelected ? '1' : '0.8');
      g.appendChild(arrowEl);
    });
  }

  // ── Drag from palette ─────────────────────────────────────────
  function _paletteDragStart(e) {
    e.dataTransfer.setData('text/plain', JSON.stringify({
      action: 'palette-node',
      type: e.currentTarget.dataset.type,
      subtype: e.currentTarget.dataset.subtype,
    }));
    e.dataTransfer.effectAllowed = 'copy';
  }

  function _drop(e) {
    e.preventDefault();
    const data = JSON.parse(e.dataTransfer.getData('text/plain') || '{}');
    const scrollWrap = document.getElementById('canvas-scroll-wrap');
    if (!scrollWrap) return;
    const rect = scrollWrap.getBoundingClientRect();
    const x = (e.clientX - rect.left - panX) / zoom - 90;
    const y = (e.clientY - rect.top - panY) / zoom - 40;

    if (data.action === 'column-chip') {
      _addNodeFromColumn(data.columnName, data.columnType, x, y);
    } else if (data.action === 'palette-node' && data.type) {
      addNode(data.type, data.subtype, x, y);
    }
  }

  // ── Node drag on canvas ───────────────────────────────────────
  function _nodeMDown(e, nodeId) {
    e.preventDefault();
    const pos = nodePositions[nodeId] || { x: 0, y: 0 };
    dragStartSnapshot = {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
      nodePositions: JSON.parse(JSON.stringify(nodePositions))
    };
    dragging = { nodeId, startMouseX: e.clientX, startMouseY: e.clientY, origX: pos.x, origY: pos.y };
    selectNode(nodeId);
  }

  function _canvasMDown(e) {
    const scrollWrap = document.getElementById('canvas-scroll-wrap');
    if (e.target === document.getElementById('canvas-area') ||
        e.target === document.getElementById('canvas-svg') ||
        e.target === document.getElementById('canvas-nodes') ||
        e.target === scrollWrap ||
        e.target === document.getElementById('canvas-workspace')) {
      deselectNode();
      if (scrollWrap) {
        isPanning = true;
        panStart = { x: e.clientX, y: e.clientY };
        scrollStart = { x: panX, y: panY };
        scrollWrap.style.cursor = 'grabbing';
      }
    }
  }

  function _canvasMMove(e) {
    if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      panX = scrollStart.x + dx;
      panY = scrollStart.y + dy;
      updateWorkspaceTransform();
      return;
    }
    if (dragging) {
      const dx = e.clientX - dragging.startMouseX;
      const dy = e.clientY - dragging.startMouseY;
      const nx = dragging.origX + dx / zoom;
      const ny = dragging.origY + dy / zoom;
      nodePositions[dragging.nodeId] = { x: nx, y: ny };
      const el = document.getElementById(`node-${dragging.nodeId}`);
      if (el) { el.style.left = nx + 'px'; el.style.top = ny + 'px'; }
      renderEdges();
    }
    if (connecting) {
      const scrollWrap = document.getElementById('canvas-scroll-wrap');
      if (scrollWrap) {
        const rect = scrollWrap.getBoundingClientRect();
        const mx = (e.clientX - rect.left - panX) / zoom;
        const my = (e.clientY - rect.top - panY) / zoom;
        const fp = nodePositions[connecting.fromNodeId];
        if (fp) {
          const isInput = connecting.fromPortType === 'input';
          const x1 = isInput ? fp.x : fp.x + 180;
          const y1 = fp.y + 40;
          const te = document.getElementById('temp-edge');
          if (te) {
            te.style.display = '';
            const cx1 = x1 + Math.abs(mx - x1) * 0.45;
            const cx2 = mx - Math.abs(mx - x1) * 0.45;
            te.setAttribute('d', `M${x1},${y1} C${cx1},${y1} ${cx2},${my} ${mx},${my}`);
          }
        }
      }
    }
  }

  function _canvasMUp() {
    if (isPanning) {
      isPanning = false;
      const scrollWrap = document.getElementById('canvas-scroll-wrap');
      if (scrollWrap) {
        scrollWrap.style.cursor = 'grab';
      }
    }
    if (dragging) {
      const pos = nodePositions[dragging.nodeId];
      if (pos && (pos.x !== dragging.origX || pos.y !== dragging.origY)) {
        if (dragStartSnapshot) {
          historyStack.push(dragStartSnapshot);
          if (historyStack.length > 50) historyStack.shift();
        }
        markDirty();
      }
      dragging = null;
      dragStartSnapshot = null;
    }
    if (connecting) {
      connecting = null;
      const te = document.getElementById('temp-edge');
      if (te) te.style.display = 'none';
    }
  }

  function _portMDown(e, nodeId, portType) {
    e.stopPropagation();
    e.preventDefault();
    connecting = { fromNodeId: nodeId, fromPortType: portType };
  }

  function _portMUp(e, nodeId, portType) {
    e.stopPropagation();
    if (connecting && connecting.fromNodeId !== nodeId) {
      const fromId = connecting.fromNodeId;
      const fromPort = connecting.fromPortType;
      const toId = nodeId;
      const toPort = portType;

      let edgeFrom = fromId;
      let edgeTo = toId;

      if (fromPort === 'output' && toPort === 'input') {
        edgeFrom = fromId;
        edgeTo = toId;
      } else if (fromPort === 'input' && toPort === 'output') {
        edgeFrom = toId;
        edgeTo = fromId;
      } else {
        const fromNode = nodes.find(n => n.id === fromId);
        const toNode = nodes.find(n => n.id === toId);
        
        if (fromNode.type === 'source' || toNode.type === 'output') {
          edgeFrom = fromId;
          edgeTo = toId;
        } else if (toNode.type === 'source' || fromNode.type === 'output') {
          edgeFrom = toId;
          edgeTo = fromId;
        } else {
          const fp = nodePositions[fromId] || { x: 0 };
          const tp = nodePositions[toId] || { x: 0 };
          if (fp.x <= tp.x) {
            edgeFrom = fromId;
            edgeTo = toId;
          } else {
            edgeFrom = toId;
            edgeTo = fromId;
          }
        }
      }

      // Check duplicate
      const duplicate = edges.some(ed => ed.from === edgeFrom && ed.to === edgeTo);
      if (!duplicate) {
        pushHistory();
        edges.push({ id: 'e' + Storage.uid(), from: edgeFrom, to: edgeTo });
        markDirty();
        renderEdges();
        runWorkflow();
      }
    }
    connecting = null;
    const te = document.getElementById('temp-edge');
    if (te) te.style.display = 'none';
  }

  function _portClick(e, nodeId, portType) {
    e.stopPropagation();
    if (connecting) {
      if (connecting.fromNodeId !== nodeId) {
        const fromId = connecting.fromNodeId;
        const fromPort = connecting.fromPortType;
        const toId = nodeId;
        const toPort = portType;

        let edgeFrom = fromId;
        let edgeTo = toId;

        if (fromPort === 'output' && toPort === 'input') {
          edgeFrom = fromId;
          edgeTo = toId;
        } else if (fromPort === 'input' && toPort === 'output') {
          edgeFrom = toId;
          edgeTo = fromId;
        } else {
          const fromNode = nodes.find(n => n.id === fromId);
          const toNode = nodes.find(n => n.id === toId);
          
          if (fromNode.type === 'source' || toNode.type === 'output') {
            edgeFrom = fromId;
            edgeTo = toId;
          } else if (toNode.type === 'source' || fromNode.type === 'output') {
            edgeFrom = toId;
            edgeTo = fromId;
          } else {
            const fp = nodePositions[fromId] || { x: 0 };
            const tp = nodePositions[toId] || { x: 0 };
            if (fp.x <= tp.x) {
              edgeFrom = fromId;
              edgeTo = toId;
            } else {
              edgeFrom = toId;
              edgeTo = fromId;
            }
          }
        }

        const duplicate = edges.some(ed => ed.from === edgeFrom && ed.to === edgeTo);
        if (!duplicate) {
          pushHistory();
          edges.push({ id: 'e' + Storage.uid(), from: edgeFrom, to: edgeTo });
          markDirty();
          renderEdges();
          runWorkflow();
        }
      }
      connecting = null;
      const te = document.getElementById('temp-edge');
      if (te) te.style.display = 'none';
    } else {
      connecting = { fromNodeId: nodeId, fromPortType: portType };
    }
  }

  // ── Select / deselect ─────────────────────────────────────────
  function selectNode(nodeId) {
    selectedNodeId = nodeId;
    selectedEdgeId = null;
    renderNodes();
    renderEdges();
    renderConfigPanel();
  }

  function selectEdge(edgeId) {
    selectedEdgeId = edgeId;
    selectedNodeId = null;
    renderNodes();
    renderEdges();
    const body = document.getElementById('config-panel-body');
    if (body) {
      body.innerHTML = `
        <div class="config-panel-empty">
          <div style="width:36px;height:36px;color:var(--color-current-teal);margin-bottom:12px;opacity:0.6;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:100%;height:100%;">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="none"/>
              <path d="M2 12L12 17L22 12" stroke="currentColor"/>
              <path d="M2 17L12 22L22 17" stroke="currentColor"/>
            </svg>
          </div>
          <span>Connection Selected</span>
          <div style="font-size:11px;color:var(--color-fog-veil);margin-top:8px;text-align:center;line-height:1.4;">
            Active connection between nodes.<br>
            Press <strong>Backspace</strong> / <strong>Delete</strong> or click below to remove.
          </div>
        </div>
      `;
    }
    const footer = document.getElementById('config-panel-footer');
    if (footer) {
      footer.style.display = 'flex';
      footer.innerHTML = `
        <button class="btn btn-sm btn-danger" onclick="Canvas.deleteSelection()" style="flex:1">Delete Connection</button>
      `;
    }
    document.getElementById('config-panel-title').textContent = 'Connection Properties';
  }

  function deselectNode() {
    selectedNodeId = null;
    selectedEdgeId = null;
    renderNodes();
    renderEdges();
    const body = document.getElementById('config-panel-body');
    if (body) {
      body.innerHTML = `
        <div class="config-panel-empty">
          <div style="width:32px;height:32px;opacity:0.3;margin-bottom:12px;">${UI.logoSVG}</div>
          <span>Select a node to configure it</span>
        </div>
      `;
    }
    const footer = document.getElementById('config-panel-footer');
    if (footer) {
      footer.style.display = 'none';
      footer.innerHTML = `
        <button class="btn btn-sm btn-danger" onclick="Canvas.deleteSelectedNode()" style="flex:1">Delete</button>
        <button class="btn btn-sm btn-primary" onclick="Canvas.applyNodeConfig()" style="flex:1">Apply</button>
      `;
    }
    document.getElementById('config-panel-title').textContent = 'Node Properties';
  }

  // ── Zoom and Pan Helpers ─────────────────────────────────────
  function updateWorkspaceTransform() {
    const ws = document.getElementById('canvas-workspace');
    if (ws) {
      ws.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
      ws.style.transformOrigin = '0 0';
    }
    const zoomPct = document.getElementById('zoom-percentage');
    if (zoomPct) {
      zoomPct.textContent = Math.round(zoom * 100) + '%';
    }
  }

  function zoomIn() {
    zoom = Math.min(2.5, zoom * 1.2);
    updateWorkspaceTransform();
  }

  function zoomOut() {
    zoom = Math.max(0.4, zoom / 1.2);
    updateWorkspaceTransform();
  }

  function zoomReset() {
    zoom = 1.0;
    panX = 0;
    panY = 0;
    updateWorkspaceTransform();
  }

  // ── Config Panel ──────────────────────────────────────────────
  function renderConfigPanel() {
    const node = nodes.find(n => n.id === selectedNodeId);
    if (!node) return;
    const info = getTypeInfo(node.type, node.subtype);
    document.getElementById('config-panel-title').innerHTML = `<span class="${info.colorClass}" style="margin-right:6px;">${info.icon}</span>${escHtml(node.label)}`;
    const footer = document.getElementById('config-panel-footer');
    if (footer) {
      footer.style.display = 'flex';
      footer.innerHTML = `
        <button class="btn btn-sm btn-danger" onclick="Canvas.deleteSelectedNode()" style="flex:1">Delete</button>
        <button class="btn btn-sm btn-primary" onclick="Canvas.applyNodeConfig()" style="flex:1">Apply</button>
      `;
    }

    const c = node.config || {};
    const availCols = uploadedData ? uploadedData.columns : [];
    const colOptions = availCols.length
      ? `<datalist id="col-list">${availCols.map(col => `<option value="${escHtml(col)}">`).join('')}</datalist>`
      : '';

    let html = colOptions + `
      <div class="form-group">
        <label class="form-label">Node Label</label>
        <input class="form-input" id="cfg-label" value="${escHtml(node.label)}" placeholder="Node label"/>
      </div>`;

    switch (node.subtype || node.type) {
      case 'csv':
        html += `<div class="form-group"><label class="form-label">CSV Data</label>
          <textarea class="form-textarea" id="cfg-csv" rows="6" placeholder="name,age\nAlice,30">${escHtml(c.csvText||'')}</textarea></div>
          <div style="font-size:11px;color:var(--color-fog-veil)">First row = headers. Loaded file data is used if empty.</div>`;
        break;
      case 'json':
        html += `<div class="form-group"><label class="form-label">JSON Data</label>
          <textarea class="form-textarea" id="cfg-json" rows="6" placeholder='[{"name":"Alice"}]'>${escHtml(c.jsonText||'')}</textarea></div>`;
        break;
      case 'api':
        html += `<div class="form-group"><label class="form-label">Endpoint URL</label>
          <input class="form-input" id="cfg-url" value="${escHtml(c.url||'')}" placeholder="https://api.example.com/data"/></div>
          <div class="form-group"><label class="form-label">Method</label>
          <select class="form-select" id="cfg-method"><option ${c.method==='GET'?'selected':''}>GET</option><option ${c.method==='POST'?'selected':''}>POST</option></select></div>
          <div class="form-group"><label class="form-label">Auth Header</label>
          <input class="form-input" id="cfg-auth" value="${escHtml(c.auth||'')}" placeholder="Bearer token"/></div>`;
        break;
      case 'db':
        html += `<div class="form-group"><label class="form-label">PostgreSQL Connection URI</label>
          <input class="form-input" id="cfg-db-uri" value="${escHtml(c.connectionString||'postgresql://neondb_owner:npg_raOEb8sH5pfZ@ep-dawn-forest-aidva6wp-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require')}" placeholder="postgresql://user:pass@host/db"/></div>
          <div class="form-group"><label class="form-label">SQL Query</label>
          <textarea class="form-textarea" id="cfg-db-query" rows="4" placeholder="SELECT * FROM employees LIMIT 100">${escHtml(c.query||'SELECT * FROM employees LIMIT 100')}</textarea></div>`;
        break;
      case 'add_column':
        html += `<div class="form-group"><label class="form-label">New Column Name</label>
          <input class="form-input" id="cfg-targetCol" value="${escHtml(c.targetColumn||'')}" placeholder="Age" list="col-list"/></div>
          <div class="form-group"><label class="form-label">Formula</label>
          <input class="form-input" id="cfg-formula" value="${escHtml(c.formula||'')}" placeholder='datediff(DOB)  or  {Amount}*1.18'/></div>
          
          <!-- Visual Formula Helper -->
          <div class="formula-helper-box" style="border: 1px dashed rgba(0, 130, 124, 0.4); background: var(--surface-trench); padding: 12px; border-radius: 8px; margin-top: 12px; margin-bottom: 12px;">
            <div style="font-size:12px; font-weight:600; color:var(--color-current-teal); margin-bottom:10px; display:flex; align-items:center; gap:6px;">
              <span>⚡</span> Formula Builder (Visual Helper)
            </div>
            
            <div class="form-group" style="margin-bottom:8px;">
              <label class="form-label" style="font-size:11px; margin-bottom:4px; opacity:0.8;">Select Template</label>
              <select class="form-select" id="cfg-formula-helper-type" style="padding:6px 10px; font-size:12px; height:34px;" onchange="Canvas._onFormulaHelperChange()">
                <option value="">-- Choose Template --</option>
                <option value="math">Mathematical Operation (e.g. A * B)</option>
                <option value="text">Text Case Conversion (UPPER/lower)</option>
                <option value="datediff">Calculate Age from Date/DOB</option>
                <option value="operator">Detect Mobile Operator from Phone</option>
                <option value="cond">Conditional Expression (If / Else)</option>
                <option value="clean_text">Clean Text (Trim Spaces)</option>
                <option value="prompt">Create with simple prompt...</option>
              </select>
            </div>
            
            <div id="cfg-formula-helper-inputs" style="display:flex; flex-direction:column; gap:8px;"></div>
          </div>

          <div style="font-size:11px;color:var(--color-fog-veil);line-height:1.7;">
            <strong>Examples:</strong><br>
            • <code>datediff(DOB)</code> → Age from DOB<br>
            • <code>{Amount}*1.18</code> → +18% tax<br>
            • <code>upper({Name})</code> → uppercase<br>
            • <code>operator(Phone)</code> → detect carrier
          </div>`;
        break;
      case 'rename_column':
        html += `<div class="form-group"><label class="form-label">Column Renames</label>
          <div id="renames-list">${Object.entries(c.renames||{}).map(([k,v]) => renameRow(k,v)).join('')}</div>
          <button class="btn btn-sm btn-secondary" onclick="Canvas._addRenameRow()" style="width:100%;margin-top:8px;">+ Add Rename</button></div>`;
        break;
      case 'delete_column':
        html += `<div class="form-group"><label class="form-label">Columns to Delete</label>
          <input class="form-input" id="cfg-delcols" value="${escHtml((c.columns||[]).join(', '))}" placeholder="ColA, ColB" list="col-list"/></div>`;
        break;
      case 'lookup_map':
        html += `<div class="form-group"><label class="form-label">Source Column</label>
          <input class="form-input" id="cfg-srcCol" value="${escHtml(c.sourceColumn||'')}" placeholder="Country" list="col-list"/></div>
          <div class="form-group"><label class="form-label">New Column</label>
          <input class="form-input" id="cfg-tgtCol" value="${escHtml(c.targetColumn||'')}" placeholder="CountryCode"/></div>
          <div class="form-group"><label class="form-label">Value Map (JSON)</label>
          <textarea class="form-textarea" id="cfg-map" rows="4">${escHtml(c.map ? JSON.stringify(c.map,null,2) : '{\n  "India": "IND",\n  "USA": "USA",\n  "Germany": "DEU"\n}')}</textarea></div>`;
        break;
      case 'row_filter':
        html += `<div class="form-group"><label class="form-label">Column</label>
          <input class="form-input" id="cfg-filterCol" value="${escHtml(c.column||'')}" placeholder="Region" list="col-list"/></div>
          <div class="form-group"><label class="form-label">Operator</label>
          <select class="form-select" id="cfg-op">
          ${['equals','not_equals','contains','starts_with','ends_with','gt','lt','gte','lte','not_empty','is_empty'].map(op => `<option value="${op}" ${c.operator===op?'selected':''}>${op.replace(/_/g,' ')}</option>`).join('')}
          </select></div>
          <div class="form-group"><label class="form-label">Value</label>
          <input class="form-input" id="cfg-filterVal" value="${escHtml(c.value||'')}" placeholder="North"/></div>`;
        break;
      case 'text_transform':
        html += `<div class="form-group"><label class="form-label">Column</label>
          <input class="form-input" id="cfg-ttCol" value="${escHtml(c.column||'')}" placeholder="Name" list="col-list"/></div>
          <div class="form-group"><label class="form-label">Operation</label>
          <select class="form-select" id="cfg-ttOp">
          ${['upper','lower','trim','title'].map(op => `<option ${c.operation===op?'selected':''}>${op}</option>`).join('')}
          </select></div>`;
        break;
      case 'replace_value':
        html += `<div class="form-group"><label class="form-label">Column</label>
          <input class="form-input" id="cfg-rvCol" value="${escHtml(c.column||'')}" placeholder="Phone" list="col-list"/></div>
          <div class="form-group"><label class="form-label">Find (regex)</label>
          <input class="form-input" id="cfg-rvFind" value="${escHtml(c.find||'')}" placeholder="\\+91-"/></div>
          <div class="form-group"><label class="form-label">Replace With</label>
          <input class="form-input" id="cfg-rvReplace" value="${escHtml(c.replace||'')}" placeholder="0"/></div>`;
        break;
      case 'mapping': {
        const mappings = c.mappings || [];
        const keepUnmapped = !!c.keepUnmapped;
        html += `
          <div class="form-group">
            <label class="form-label">Field Mappings</label>
            <div id="mappings-list" style="max-height:280px;overflow-y:auto;padding-right:4px;margin-bottom:10px;">
              ${mappings.map(m => mappingRow(m.source, m.target, m.type, m.transform, m.defaultValue, m.condExpr)).join('')}
            </div>
            <button class="btn btn-sm btn-secondary" onclick="Canvas._addMappingRow()" style="width:100%;margin-top:6px;">+ Add Field Mapping</button>
          </div>
          <div class="form-group" style="display:flex;align-items:center;gap:8px;margin-top:12px;">
            <input type="checkbox" id="cfg-keep-unmapped" ${keepUnmapped?'checked':''} style="cursor:pointer;margin:0;width:16px;height:16px;"/>
            <label for="cfg-keep-unmapped" class="form-label" style="margin-bottom:0;cursor:pointer;">Keep unmapped columns</label>
          </div>
        `;
        break;
      }
      case 'rule_engine': {
        const rules = c.rules || [];
        const groupOp = c.groupOp || 'AND';
        const action = c.action || 'flag';
        const errorMsg = c.errorMessage || 'Validation failed';
        html += `
          <div class="form-group">
            <label class="form-label">Rules Grouping</label>
            <select class="form-select" id="cfg-rule-group-op" onchange="Canvas.testRuleSimulation()">
              <option value="AND" ${groupOp==='AND'?'selected':''}>Match ALL rules (AND)</option>
              <option value="OR" ${groupOp==='OR'?'selected':''}>Match ANY rule (OR)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Validation Rules</label>
            <div id="rules-list" style="max-height:240px;overflow-y:auto;padding-right:4px;margin-bottom:10px;">
              ${rules.map(r => ruleRow(r.column, r.operator, r.value)).join('')}
            </div>
            <button class="btn btn-sm btn-secondary" onclick="Canvas._addRuleRow()" style="width:100%;margin-top:6px;">+ Add Validation Rule</button>
          </div>
          <div class="form-group">
            <label class="form-label">Validation Action</label>
            <select class="form-select" id="cfg-rule-action" onchange="Canvas.testRuleSimulation()">
              <option value="flag" ${action==='flag'?'selected':''}>Flag invalid rows (add columns)</option>
              <option value="filter" ${action==='filter'?'selected':''}>Filter out invalid rows</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Custom Error Message</label>
            <input class="form-input" id="cfg-rule-err" value="${escHtml(errorMsg)}" placeholder="Age must be positive" oninput="Canvas.testRuleSimulation()"/>
          </div>
          <div class="rule-sim-box" style="margin-top:16px;border-top:1px solid rgba(237,255,254,0.08);padding-top:12px;">
            <div style="font-size:11px;font-weight:600;color:var(--color-snow-sheet);margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
              <span>Rule Simulation</span>
              <button class="btn btn-xs btn-primary" onclick="Canvas.testRuleSimulation()" style="font-size:9px;padding:2px 6px;">Simulate Test</button>
            </div>
            <div id="rule-sim-badge" style="padding:8px;border-radius:4px;font-size:11px;font-family:monospace;background:rgba(255,255,255,0.02);border:1px dashed rgba(255,255,255,0.1);color:var(--color-fog-veil)">
              Click Simulate Test to evaluate on first data record.
            </div>
          </div>
        `;
        break;
      }
      default:
        html += `<div class="form-group"><label class="form-label">Output Filename</label>
          <input class="form-input" id="cfg-filename" value="${escHtml(c.filename||'output.csv')}" placeholder="output.csv"/></div>`;
    }

    document.getElementById('config-panel-body').innerHTML = html;
  }

  function renameRow(oldName = '', newName = '') {
    return `<div class="rule-item" style="margin-bottom:6px;">
      <input class="form-input rename-old" value="${escHtml(oldName)}" placeholder="OldName" style="flex:1;padding:6px 10px;font-size:12px;"/>
      <span style="color:var(--color-fog-veil);margin:0 6px;">→</span>
      <input class="form-input rename-new" value="${escHtml(newName)}" placeholder="NewName" style="flex:1;padding:6px 10px;font-size:12px;"/>
      <button class="rule-item-del" onclick="this.parentElement.remove()">✕</button>
    </div>`;
  }

  function _addRenameRow() {
    document.getElementById('renames-list')?.insertAdjacentHTML('beforeend', renameRow());
  }

  // ── Apply config ──────────────────────────────────────────────
  function applyNodeConfig() {
    const node = nodes.find(n => n.id === selectedNodeId);
    if (!node) return;
    pushHistory();
    const label = document.getElementById('cfg-label')?.value?.trim();
    if (label) node.label = label;
    const c = node.config || {};
    node.config = c;

    switch (node.subtype || node.type) {
      case 'csv':    c.csvText = document.getElementById('cfg-csv')?.value || ''; break;
      case 'json':   c.jsonText = document.getElementById('cfg-json')?.value || ''; break;
      case 'api':
        c.url = document.getElementById('cfg-url')?.value || '';
        c.method = document.getElementById('cfg-method')?.value || 'GET';
        c.auth = document.getElementById('cfg-auth')?.value || '';
        break;
      case 'db':
        c.connectionString = document.getElementById('cfg-db-uri')?.value || '';
        c.query = document.getElementById('cfg-db-query')?.value || '';
        break;
      case 'add_column':
        c.targetColumn = document.getElementById('cfg-targetCol')?.value || '';
        c.formula = document.getElementById('cfg-formula')?.value || '';
        break;
      case 'rename_column': {
        const renames = {};
        document.querySelectorAll('.rename-old').forEach((el, i) => {
          const nEl = document.querySelectorAll('.rename-new')[i];
          if (el.value.trim() && nEl?.value.trim()) renames[el.value.trim()] = nEl.value.trim();
        });
        c.renames = renames;
        break;
      }
      case 'delete_column':
        c.columns = (document.getElementById('cfg-delcols')?.value || '').split(',').map(s => s.trim()).filter(Boolean);
        break;
      case 'lookup_map':
        c.sourceColumn = document.getElementById('cfg-srcCol')?.value || '';
        c.targetColumn = document.getElementById('cfg-tgtCol')?.value || '';
        try { c.map = JSON.parse(document.getElementById('cfg-map')?.value || '{}'); } catch { c.map = {}; }
        break;
      case 'row_filter':
        c.column = document.getElementById('cfg-filterCol')?.value || '';
        c.operator = document.getElementById('cfg-op')?.value || 'equals';
        c.value = document.getElementById('cfg-filterVal')?.value || '';
        break;
      case 'text_transform':
        c.column = document.getElementById('cfg-ttCol')?.value || '';
        c.operation = document.getElementById('cfg-ttOp')?.value || 'upper';
        break;
      case 'replace_value':
        c.column = document.getElementById('cfg-rvCol')?.value || '';
        c.find = document.getElementById('cfg-rvFind')?.value || '';
        c.replace = document.getElementById('cfg-rvReplace')?.value || '';
        break;
      case 'mapping': {
        const mappings = [];
        document.querySelectorAll('.mapping-item').forEach(el => {
          mappings.push({
            source: el.querySelector('.mapping-src').value,
            target: el.querySelector('.mapping-tgt').value,
            type: el.querySelector('.mapping-type').value,
            transform: el.querySelector('.mapping-trans').value,
            defaultValue: el.querySelector('.mapping-def').value,
            condExpr: el.querySelector('.mapping-cond').value,
          });
        });
        c.mappings = mappings;
        c.keepUnmapped = document.getElementById('cfg-keep-unmapped')?.checked || false;
        break;
      }
      case 'rule_engine': {
        const rules = [];
        document.querySelectorAll('.rule-item-box').forEach(el => {
          rules.push({
            column: el.querySelector('.rule-col').value,
            operator: el.querySelector('.rule-op').value,
            value: el.querySelector('.rule-val').value,
          });
        });
        c.rules = rules;
        c.groupOp = document.getElementById('cfg-rule-group-op')?.value || 'AND';
        c.action = document.getElementById('cfg-rule-action')?.value || 'flag';
        c.errorMessage = document.getElementById('cfg-rule-err')?.value || 'Validation failed';
        break;
      }
      default:
        c.filename = document.getElementById('cfg-filename')?.value || 'output.csv';
    }

    markDirty();
    renderNodes();
    UI.toast('Configuration applied ✓', 'success');
    runWorkflow();
  }

  // ── Delete node ───────────────────────────────────────────────
  function deleteSelectedNode() {
    if (!selectedNodeId) return;
    pushHistory();
    nodes = nodes.filter(n => n.id !== selectedNodeId);
    edges = edges.filter(e => e.from !== selectedNodeId && e.to !== selectedNodeId);
    delete nodePositions[selectedNodeId];
    selectedNodeId = null;
    markDirty();
    renderNodes();
    renderEdges();
    deselectNode();
    runWorkflow();
  }

  // ── Run workflow ──────────────────────────────────────────────
  function runWorkflow() {
    const btn = document.getElementById('btn-run');
    if (btn) { btn.textContent = '⏳ Running…'; btn.disabled = true; }

    // If file data is loaded, inject it into the workflow
    const wf = {
      nodes: nodes.map(n => {
        // If source node has no data but we have uploaded data, inject it
        if (n.type === 'source' && n.subtype === 'csv' && !n.config?.csvText && uploadedData) {
          return {
            ...n,
            config: {
              ...n.config,
              csvText: [uploadedData.columns.join(','), ...uploadedData.rows.map(r => uploadedData.columns.map(c => `"${String(r[c]??'').replace(/"/g,'""')}"`).join(','))].join('\n'),
            }
          };
        }
        return n;
      }),
      edges, nodePositions,
      _uploadedData: uploadedData,
    };

    setTimeout(async () => {
      const result = await Engine.run(wf);
      _lastRunState = result.success ? result.state : null;
      if (btn) { btn.textContent = '▶ Run'; btn.disabled = false; }

      if (result.success) {
        renderTransformedPreview(result.state);
        const info = document.getElementById('preview-info');
        if (info) info.textContent = `${result.state.rows.length} rows · ${result.duration}ms`;
        Storage.RunLogs.add(workflowId, 'success', result.duration, result.state.rows.length);
        UI.toast(`✓ ${result.state.rows.length} rows in ${result.duration}ms`, 'success');
        _switchPreviewTab('transformed');
      } else {
        Storage.RunLogs.add(workflowId, 'failed', result.duration || 0, 0, result.errors.join('; '));
        UI.toast('Run failed: ' + result.errors.join('; '), 'error');
        const info = document.getElementById('preview-info');
        if (info) info.textContent = result.errors[0]?.slice(0, 60);
      }
    }, 80);
  }

  function renderTransformedPreview(state) {
    const body = document.getElementById('preview-transformed');
    if (!body) return;
    if (!state.rows.length) {
      body.innerHTML = '<div class="preview-empty">No rows in output</div>';
      return;
    }

    const origCols = new Set(uploadedData ? uploadedData.columns : []);
    const origRows = uploadedData ? uploadedData.rows : [];
    const preview = state.rows.slice(0, 20);

    body.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            ${state.columns.map(c => `<th>${escHtml(c)}${!origCols.has(c) ? '<sup style="color:#4ade80;font-size:9px;margin-left:2px;">NEW</sup>' : ''}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${preview.map((row, rowIdx) =>
            `<tr>${state.columns.map(c => {
              const v = row[c];
              const isNew = !origCols.has(c);
              const origVal = origRows[rowIdx]?.[c];
              const changed = isNew || (origVal !== undefined && String(v) !== String(origVal));
              const display = v === '' || v === null || v === undefined
                ? '<span class="null-cell">null</span>'
                : escHtml(String(v));
              return `<td>${changed ? `<span class="cell-changed">${display}</span>` : display}</td>`;
            }).join('')}</tr>`
          ).join('')}
        </tbody>
      </table>
    `;
  }

  // ── Download ──────────────────────────────────────────────────
  function downloadOutput(format) {
    if (!_lastRunState) { UI.toast('Run the workflow first', 'error'); return; }
    const wf = Storage.Workflows.get(workflowId);
    const name = (wf?.name || 'output').replace(/\s+/g,'_').toLowerCase();
    if (format === 'csv') Engine.downloadCSV(_lastRunState, name + '.csv');
    else Engine.downloadJSON(_lastRunState, name + '.json');
  }

  // ── Save ──────────────────────────────────────────────────────
  function saveWorkflow() {
    Storage.Workflows.save(workflowId, nodes, edges, nodePositions, uploadedData);
    isDirty = false;
    const dot = document.getElementById('dirty-dot');
    if (dot) dot.style.display = 'none';
    UI.toast('Saved ✓', 'success');
  }

  function markDirty() {
    isDirty = true;
    const dot = document.getElementById('dirty-dot');
    if (dot) dot.style.display = '';
  }

  // ── Publish / Share ───────────────────────────────────────────
  function publish() {
    saveWorkflow();
    const wf = Storage.Workflows.publish(workflowId);
    const url = `${location.origin}${location.pathname}#/view/${wf.shareToken}`;
    document.getElementById('share-url').value = url;
    UI.openModal('modal-share');
    UI.toast('Workflow published!', 'success');
  }

  function shareLink() {
    const wf = Storage.Workflows.get(workflowId);
    if (!wf?.published) { UI.toast('Publish the workflow first', 'error'); return; }
    const url = `${location.origin}${location.pathname}#/view/${wf.shareToken}`;
    document.getElementById('share-url').value = url;
    UI.openModal('modal-share');
  }

  function _copyShare() {
    const url = document.getElementById('share-url')?.value;
    if (url) navigator.clipboard.writeText(url).then(() => UI.toast('Link copied!', 'success'));
  }

  // ── Undo / Clear ──────────────────────────────────────────────
  function undo() {
    if (!historyStack.length) {
      UI.toast('Nothing to undo', 'info');
      return;
    }
    const prevState = historyStack.pop();
    nodes = prevState.nodes;
    edges = prevState.edges;
    nodePositions = prevState.nodePositions;
    
    markDirty();
    renderNodes();
    renderEdges();
    deselectNode();
    runWorkflow();
    UI.toast('Reverted last change', 'info');
  }

  function clearCanvas() {
    if (!confirm('Clear all nodes and connections?')) return;
    pushHistory();
    nodes = []; edges = []; nodePositions = {};
    selectedNodeId = null;
    markDirty();
    renderNodes();
    renderEdges();
    deselectNode();
  }

  function mappingRow(source = '', target = '', type = 'string', transform = 'none', defaultValue = '', condExpr = '') {
    const availCols = uploadedData ? uploadedData.columns : [];
    const srcOptions = `<option value="">(None / Custom)</option>` + availCols.map(c => `<option value="${escHtml(c)}" ${c===source?'selected':''}>${escHtml(c)}</option>`).join('');
    
    return `<div class="mapping-item" style="border:1px solid rgba(237,255,254,0.08);background:var(--surface-trench);padding:10px;border-radius:6px;margin-bottom:10px;position:relative;">
      <button class="rule-item-del" onclick="this.parentElement.remove()" style="position:absolute;top:6px;right:6px;">✕</button>
      <div class="form-group" style="margin-bottom:6px;">
        <label class="form-label" style="font-size:10px;color:var(--color-fog-veil)">Source Field</label>
        <select class="form-select mapping-src" style="padding:4px 8px;font-size:11px;">${srcOptions}</select>
      </div>
      <div class="form-group" style="margin-bottom:6px;">
        <label class="form-label" style="font-size:10px;color:var(--color-fog-veil)">Destination Field</label>
        <input class="form-input mapping-tgt" value="${escHtml(target)}" placeholder="Target name" style="padding:4px 8px;font-size:11px;"/>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:6px;">
        <div class="form-group" style="flex:1;margin-bottom:0;">
          <label class="form-label" style="font-size:10px;color:var(--color-fog-veil)">Type</label>
          <select class="form-select mapping-type" style="padding:4px 8px;font-size:11px;">
            ${['string','number','boolean','date'].map(t => `<option ${t===type?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="flex:1;margin-bottom:0;">
          <label class="form-label" style="font-size:10px;color:var(--color-fog-veil)">Transform</label>
          <select class="form-select mapping-trans" style="padding:4px 8px;font-size:11px;">
            ${[['none','None'],['trim','Trim'],['upper','Uppercase'],['lower','Lowercase'],['title','Title Case']].map(([k,v]) => `<option value="${k}" ${k===transform?'selected':''}>${v}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group" style="margin-bottom:6px;">
        <label class="form-label" style="font-size:10px;color:var(--color-fog-veil)">Default Value</label>
        <input class="form-input mapping-def" value="${escHtml(defaultValue)}" placeholder="Fallback value" style="padding:4px 8px;font-size:11px;"/>
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label class="form-label" style="font-size:10px;color:var(--color-fog-veil)">Conditional Logic (Formula)</label>
        <input class="form-input mapping-cond" value="${escHtml(condExpr)}" placeholder="e.g. {Age} > 60 ? 'Senior' : 'Adult'" style="padding:4px 8px;font-size:11px;"/>
      </div>
    </div>`;
  }

  function ruleRow(column = '', operator = 'equals', value = '') {
    const availCols = uploadedData ? uploadedData.columns : [];
    const colOptions = availCols.map(c => `<option value="${escHtml(c)}" ${c===column?'selected':''}>${escHtml(c)}</option>`).join('');
    const opOptions = ['equals','not_equals','contains','starts_with','ends_with','gt','lt','gte','lte','not_empty','is_empty'].map(op => `<option value="${op}" ${operator===op?'selected':''}>${op.replace(/_/g,' ')}</option>`).join('');

    return `<div class="rule-item-box" style="border:1px solid rgba(237,255,254,0.08);background:var(--surface-trench);padding:8px;border-radius:6px;margin-bottom:8px;position:relative;">
      <button class="rule-item-del" onclick="this.parentElement.remove()" style="position:absolute;top:4px;right:4px;">✕</button>
      <div class="form-group" style="margin-bottom:4px;">
        <label class="form-label" style="font-size:9px;color:var(--color-fog-veil)">Column</label>
        <select class="form-select rule-col" style="padding:4px 8px;font-size:11px;">${colOptions}</select>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:0;">
        <div class="form-group" style="flex:1;margin-bottom:0;">
          <label class="form-label" style="font-size:9px;color:var(--color-fog-veil)">Operator</label>
          <select class="form-select rule-op" style="padding:4px 8px;font-size:11px;">${opOptions}</select>
        </div>
        <div class="form-group" style="flex:1;margin-bottom:0;">
          <label class="form-label" style="font-size:9px;color:var(--color-fog-veil)">Value</label>
          <input class="form-input rule-val" value="${escHtml(value)}" placeholder="Value" style="padding:4px 8px;font-size:11px;"/>
        </div>
      </div>
    </div>`;
  }

  function _addMappingRow() {
    document.getElementById('mappings-list')?.insertAdjacentHTML('beforeend', mappingRow());
  }

  function _addRuleRow() {
    document.getElementById('rules-list')?.insertAdjacentHTML('beforeend', ruleRow());
    testRuleSimulation();
  }

  function testRuleSimulation() {
    const badge = document.getElementById('rule-sim-badge');
    if (!badge) return;
    if (!uploadedData || !uploadedData.rows.length) {
      badge.innerHTML = `<span style="color:#f87171">No uploaded data file to simulate.</span>`;
      return;
    }

    const rules = [];
    const colEl = document.querySelectorAll('.rule-col');
    const opEl = document.querySelectorAll('.rule-op');
    const valEl = document.querySelectorAll('.rule-val');
    
    colEl.forEach((el, i) => {
      rules.push({
        column: el.value,
        operator: opEl[i].value,
        value: valEl[i].value,
      });
    });

    if (!rules.length) {
      badge.innerHTML = `<span style="color:var(--color-fog-veil)">Add at least one rule to simulate.</span>`;
      return;
    }

    const groupOp = document.getElementById('cfg-rule-group-op')?.value || 'AND';
    const action = document.getElementById('cfg-rule-action')?.value || 'flag';
    const err = document.getElementById('cfg-rule-err')?.value || 'Validation failed';

    const row = uploadedData.rows[0];
    
    const evaluateRule = (r, record) => {
      const cell = String(record[r.column] ?? '');
      const val = String(r.value ?? '');
      const op = r.operator;
      switch (op) {
        case 'equals':      return cell === val;
        case 'not_equals':  return cell !== val;
        case 'contains':    return cell.toLowerCase().includes(val.toLowerCase());
        case 'starts_with': return cell.toLowerCase().startsWith(val.toLowerCase());
        case 'ends_with':   return cell.toLowerCase().endsWith(val.toLowerCase());
        case 'gt':          return parseFloat(cell) > parseFloat(val);
        case 'lt':          return parseFloat(cell) < parseFloat(val);
        case 'gte':         return parseFloat(cell) >= parseFloat(val);
        case 'lte':         return parseFloat(cell) <= parseFloat(val);
        case 'not_empty':   return cell.trim() !== '';
        case 'is_empty':    return cell.trim() === '';
        default:            return true;
      }
    };

    const matches = rules.map(r => evaluateRule(r, row));
    const passed = groupOp === 'AND'
      ? matches.every(m => m === true)
      : matches.some(m => m === true);

    const firstRecordInfo = Object.entries(row).slice(0, 3).map(([k,v]) => `${k}:${v}`).join(', ');

    if (passed) {
      badge.innerHTML = `
        <div style="color:#4ade80;font-weight:600;margin-bottom:4px;">PASS ✓ (Simulation Successful)</div>
        <div style="font-size:10px;color:rgba(187,199,198,0.5);line-height:1.4;">
          <strong>Record 1:</strong> { ${firstRecordInfo}... }<br>
          <strong>Evaluation:</strong> All conditions satisfied!
        </div>
      `;
    } else {
      badge.innerHTML = `
        <div style="color:#f87171;font-weight:600;margin-bottom:4px;">FAIL ✕ (Rule Violated)</div>
        <div style="font-size:10px;color:rgba(187,199,198,0.5);line-height:1.4;">
          <strong>Record 1:</strong> { ${firstRecordInfo}... }<br>
          <strong>Action:</strong> ${action === 'filter' ? 'Filtered out' : `Flagged with: "${err}"`}<br>
          <strong>Results:</strong><br>${rules.map((r, i) => `• ${r.column} ${r.operator} ${r.value} → ${matches[i] ? '<span style="color:#4ade80">PASS</span>' : '<span style="color:#f87171">FAIL</span>'}`).join('<br>')}
        </div>
      `;
    }
  }

  function deleteSelection() {
    if (selectedNodeId) {
      deleteSelectedNode();
      return true;
    }
    if (selectedEdgeId) {
      pushHistory();
      edges = edges.filter(ed => ed.id !== selectedEdgeId);
      selectedEdgeId = null;
      markDirty();
      renderEdges();
      deselectNode();
      UI.toast('Connection deleted', 'info');
      runWorkflow();
      return true;
    }
    return false;
  }
  // ── Formula Helper UI Logic ───────────────────────────────────
  function _onFormulaHelperChange() {
    const type = document.getElementById('cfg-formula-helper-type')?.value;
    const container = document.getElementById('cfg-formula-helper-inputs');
    if (!container) return;
    
    const availCols = uploadedData ? uploadedData.columns : [];
    
    if (!type) {
      container.innerHTML = '';
      return;
    }
    
    let html = '';
    if (type === 'math') {
      html = `
        <div style="display:flex; flex-direction:column; gap:6px;">
          <div style="font-size:11px; color:var(--color-fog-veil);">Compute Left Column [op] Right Column/Value</div>
          <select class="form-select" id="cfg-math-left" style="font-size:12px; padding:4px;" onchange="Canvas._updateFormulaFromHelper()">
            <option value="">-- Left Column --</option>
            ${availCols.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('')}
          </select>
          <select class="form-select" id="cfg-math-op" style="font-size:12px; padding:4px; width:60px;" onchange="Canvas._updateFormulaFromHelper()">
            <option value="+">+</option>
            <option value="-">-</option>
            <option value="*">*</option>
            <option value="/">/</option>
          </select>
          <div style="display:flex; gap:6px; align-items:center;">
            <select class="form-select" id="cfg-math-right-type" style="font-size:11px; padding:4px;" onchange="Canvas._onMathRightTypeChange()">
              <option value="col">Another Column</option>
              <option value="val">Number Value</option>
            </select>
            <div id="cfg-math-right-container" style="flex:1;">
              <select class="form-select" id="cfg-math-right-col" style="font-size:12px; padding:4px; width:100%;" onchange="Canvas._updateFormulaFromHelper()">
                <option value="">-- Right Column --</option>
                ${availCols.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>
      `;
    } else if (type === 'text') {
      html = `
        <div style="display:flex; flex-direction:column; gap:6px;">
          <div style="font-size:11px; color:var(--color-fog-veil);">Case conversion</div>
          <select class="form-select" id="cfg-text-col" style="font-size:12px; padding:4px;" onchange="Canvas._updateFormulaFromHelper()">
            <option value="">-- Choose Column --</option>
            ${availCols.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('')}
          </select>
          <select class="form-select" id="cfg-text-op" style="font-size:12px; padding:4px;" onchange="Canvas._updateFormulaFromHelper()">
            <option value="upper">UPPERCASE</option>
            <option value="lower">lowercase</option>
            <option value="title">Title Case</option>
          </select>
        </div>
      `;
    } else if (type === 'datediff') {
      html = `
        <div style="display:flex; flex-direction:column; gap:6px;">
          <div style="font-size:11px; color:var(--color-fog-veil);">Calculate age from date column (e.g. Birthdate/DOB)</div>
          <select class="form-select" id="cfg-date-col" style="font-size:12px; padding:4px;" onchange="Canvas._updateFormulaFromHelper()">
            <option value="">-- Date Column --</option>
            ${availCols.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('')}
          </select>
        </div>
      `;
    } else if (type === 'operator') {
      html = `
        <div style="display:flex; flex-direction:column; gap:6px;">
          <div style="font-size:11px; color:var(--color-fog-veil);">Detect mobile carrier/operator from phone number</div>
          <select class="form-select" id="cfg-phone-col" style="font-size:12px; padding:4px;" onchange="Canvas._updateFormulaFromHelper()">
            <option value="">-- Phone Column --</option>
            ${availCols.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('')}
          </select>
        </div>
      `;
    } else if (type === 'cond') {
      html = `
        <div style="display:flex; flex-direction:column; gap:6px;">
          <div style="font-size:11px; color:var(--color-fog-veil);">If [column] matches condition, set value, else set fallback</div>
          <select class="form-select" id="cfg-cond-col" style="font-size:12px; padding:4px;" onchange="Canvas._updateFormulaFromHelper()">
            <option value="">-- Choose Condition Column --</option>
            ${availCols.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('')}
          </select>
          <select class="form-select" id="cfg-cond-op" style="font-size:12px; padding:4px; width:120px;" onchange="Canvas._updateFormulaFromHelper()">
            <option value="==">equals</option>
            <option value="!=">not equals</option>
            <option value="&gt;">&gt;</option>
            <option value="&lt;">&lt;</option>
            <option value="&gt;=">&gt;=</option>
            <option value="&lt;=">&lt;=</option>
            <option value="contains">contains</option>
          </select>
          <input class="form-input" id="cfg-cond-val" placeholder="Comparison value (e.g. 60 or USA)" style="font-size:12px; padding:4px;" oninput="Canvas._updateFormulaFromHelper()"/>
          <input class="form-input" id="cfg-cond-true" placeholder="Value if True (e.g. Senior or YES)" style="font-size:12px; padding:4px;" oninput="Canvas._updateFormulaFromHelper()"/>
          <input class="form-input" id="cfg-cond-false" placeholder="Value if False (leave blank for original col)" style="font-size:12px; padding:4px;" oninput="Canvas._updateFormulaFromHelper()"/>
        </div>
      `;
    } else if (type === 'clean_text') {
      html = `
        <div style="display:flex; flex-direction:column; gap:6px;">
          <div style="font-size:11px; color:var(--color-fog-veil);">Remove leading & trailing whitespaces</div>
          <select class="form-select" id="cfg-clean-col" style="font-size:12px; padding:4px;" onchange="Canvas._updateFormulaFromHelper()">
            <option value="">-- Choose Column --</option>
            ${availCols.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('')}
          </select>
        </div>
      `;
    } else if (type === 'prompt') {
      html = `
        <div style="display:flex; flex-direction:column; gap:6px;">
          <div style="font-size:11px; color:var(--color-fog-veil);">Describe in natural language</div>
          <input class="form-input" id="cfg-helper-prompt" placeholder="e.g. if age > 60 set sex to female" style="font-size:12px; padding:4px;"/>
          <button class="btn btn-sm btn-primary" onclick="Canvas._generateFormulaFromHelperPrompt()" style="padding:4px; font-size:12px; height:auto; width:100%;">Generate Formula</button>
        </div>
      `;
    }
    
    container.innerHTML = html;
    _updateFormulaFromHelper();
  }

  function _onMathRightTypeChange() {
    const rightType = document.getElementById('cfg-math-right-type')?.value;
    const container = document.getElementById('cfg-math-right-container');
    if (!container) return;
    const availCols = uploadedData ? uploadedData.columns : [];
    if (rightType === 'col') {
      container.innerHTML = `<select class="form-select" id="cfg-math-right-col" style="font-size:12px; padding:4px; width:100%;" onchange="Canvas._updateFormulaFromHelper()">${availCols.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('')}</select>`;
    } else {
      container.innerHTML = `<input class="form-input" id="cfg-math-right-val" type="number" step="any" value="1" style="font-size:12px; padding:4px;" oninput="Canvas._updateFormulaFromHelper()"/>`;
    }
    _updateFormulaFromHelper();
  }

  function _updateFormulaFromHelper() {
    const type = document.getElementById('cfg-formula-helper-type')?.value;
    const formulaInput = document.getElementById('cfg-formula');
    if (!formulaInput) return;
    
    let formula = '';
    if (type === 'math') {
      const left = document.getElementById('cfg-math-left')?.value;
      const op = document.getElementById('cfg-math-op')?.value;
      const rightType = document.getElementById('cfg-math-right-type')?.value;
      let right = '';
      if (rightType === 'col') {
        const col = document.getElementById('cfg-math-right-col')?.value;
        right = col ? `{${col}}` : '';
      } else {
        right = document.getElementById('cfg-math-right-val')?.value || '0';
      }
      if (left) {
        formula = `{${left}} ${op} ${right}`;
      }
    } else if (type === 'text') {
      const col = document.getElementById('cfg-text-col')?.value;
      const op = document.getElementById('cfg-text-op')?.value;
      if (col) {
        formula = `${op}({${col}})`;
      }
    } else if (type === 'datediff') {
      const col = document.getElementById('cfg-date-col')?.value;
      if (col) {
        formula = `datediff(${col})`;
      }
    } else if (type === 'operator') {
      const col = document.getElementById('cfg-phone-col')?.value;
      if (col) {
        formula = `operator(${col})`;
      }
    } else if (type === 'cond') {
      const col = document.getElementById('cfg-cond-col')?.value;
      const op = document.getElementById('cfg-cond-op')?.value;
      const val = document.getElementById('cfg-cond-val')?.value || '';
      const valTrue = document.getElementById('cfg-cond-true')?.value || '';
      const valFalse = document.getElementById('cfg-cond-false')?.value || '';
      
      if (col) {
        const isNum = !isNaN(parseFloat(val)) && val.trim() !== '';
        const cmpVal = isNum ? val : JSON.stringify(val);
        
        let condStr = '';
        if (op === 'contains') {
          condStr = `String({${col}}).toLowerCase().includes(${JSON.stringify(val.toLowerCase())})`;
        } else {
          condStr = `{${col}} ${op} ${cmpVal}`;
        }
        
        const isTrueNum = !isNaN(parseFloat(valTrue)) && valTrue.trim() !== '';
        const trueBranch = isTrueNum ? valTrue : JSON.stringify(valTrue);
        
        const falseBranch = valFalse.trim() !== '' 
          ? (!isNaN(parseFloat(valFalse)) ? valFalse : JSON.stringify(valFalse))
          : `{${col}}`;
           
        formula = `${condStr} ? ${trueBranch} : ${falseBranch}`;
      }
    } else if (type === 'clean_text') {
      const col = document.getElementById('cfg-clean-col')?.value;
      if (col) {
        formula = `trim({${col}})`;
      }
    }
    
    if (formula) {
      formulaInput.value = formula;
    }
  }

  async function _generateFormulaFromHelperPrompt() {
    const prompt = document.getElementById('cfg-helper-prompt')?.value?.trim();
    if (!prompt) { UI.toast('Please enter a description', 'error'); return; }
    const availCols = uploadedData ? uploadedData.columns : [];
    
    try {
      const nodesGen = await Engine.parsePrompt(prompt, availCols);
      if (nodesGen && nodesGen.length > 0) {
        const formulaNode = nodesGen.find(n => n.subtype === 'add_column');
        if (formulaNode && formulaNode.config?.formula) {
          document.getElementById('cfg-formula').value = formulaNode.config.formula;
          if (formulaNode.config.targetColumn) {
            document.getElementById('cfg-targetCol').value = formulaNode.config.targetColumn;
          }
          UI.toast('Formula generated!', 'success');
        } else {
          const firstNode = nodesGen[0];
          if (firstNode.subtype === 'replace_value' || firstNode.subtype === 'text_transform') {
            const converted = makeNodeIntoFormula(firstNode);
            if (converted) {
              document.getElementById('cfg-formula').value = converted;
              if (firstNode.config.column) {
                document.getElementById('cfg-targetCol').value = firstNode.config.column;
              }
              UI.toast('Formula generated!', 'success');
              return;
            }
          }
          UI.toast('Parsed but could not extract a formula.', 'warning');
        }
      } else {
        UI.toast('Could not understand prompt.', 'error');
      }
    } catch (e) {
      UI.toast('Error building formula: ' + e.message, 'error');
    }
  }

  function makeNodeIntoFormula(node) {
    const sub = node.subtype;
    if (sub === 'replace_value') {
      const col = node.config.column;
      const findStr = node.config.find;
      const replaceStr = node.config.replace;
      return `String({${col}}).replace(new RegExp(${JSON.stringify(findStr)}, "g"), ${JSON.stringify(replaceStr)})`;
    }
    if (sub === 'text_transform') {
      const col = node.config.column;
      const op = node.config.operation;
      let fnExpr = 's';
      if (op === 'upper') fnExpr = 'String(s).toUpperCase()';
      else if (op === 'lower') fnExpr = 'String(s).toLowerCase()';
      else if (op === 'trim') fnExpr = 'String(s).trim()';
      else if (op === 'title') fnExpr = 'String(s).replace(/\\\\w\\\\S*/g, t => t.charAt(0).toUpperCase() + t.substr(1).toLowerCase())';
      return `((s => ${fnExpr})({${col}}))`;
    }
    return null;
  }

  return {
    init,
    selectNode, selectEdge, deselectNode,
    applyNodeConfig, deleteSelectedNode, deleteSelection,
    zoomIn, zoomOut, zoomReset,
    runWorkflow, downloadOutput,
    saveWorkflow, publish, shareLink, undo, clearCanvas, autoLayout,
    generateFromPrompt, _setPrompt,
    sendChatMessage, clearChatHistory,
    _paletteDragStart, _drop,
    _colChipDragStart, _fileDrop, _fileInputChange,
    clearFile, _addAllAsSource,
    _nodeMDown, _canvasMDown, _canvasMMove, _canvasMUp,
    _portClick, _portMDown, _portMUp, _addRenameRow, _copyShare,
    _switchPaletteTab, _switchPreviewTab,
    _addMappingRow, _addRuleRow, testRuleSimulation,
    _onFormulaHelperChange, _onMathRightTypeChange, _updateFormulaFromHelper, _generateFormulaFromHelperPrompt,
  };
})();

// Set up global keyboard listener for node and edge deletion
window.addEventListener('keydown', e => {
  if (e.target && (
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) ||
    e.target.isContentEditable
  )) {
    return;
  }
  
  if (e.key === 'Backspace' || e.key === 'Delete') {
    if (Canvas.deleteSelection()) {
      e.preventDefault();
    }
  }
});

window.Canvas = Canvas;
