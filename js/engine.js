/* ================================================================

   engine.js — In-browser transformation engine

   ================================================================ */

const Engine = (() => {

  // ── CSV Parser ───────────────────────────────────────────────

  function parseCSV(text) {

    const lines = text.trim().split('\n').filter(l => l.trim());

    if (lines.length === 0) return { columns: [], rows: [] };

    const parse = line => {

      const result = [];

      let cur = '', inQ = false;

      for (let i = 0; i < line.length; i++) {

        const ch = line[i];

        if (ch === '"') { inQ = !inQ; }

        else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; }

        else { cur += ch; }

      }

      result.push(cur.trim());

      return result;

    };

    const columns = parse(lines[0]);

    const rows = lines.slice(1).map(l => {

      const vals = parse(l);

      const row = {};

      columns.forEach((col, i) => row[col] = vals[i] !== undefined ? vals[i] : '');

      return row;

    });

    return { columns, rows };

  }

  // ── JSON Parser ──────────────────────────────────────────────

  function parseJSON(text) {

    try {

      let data = JSON.parse(text);

      if (Array.isArray(data) && data.length > 0) {

        const columns = Object.keys(data[0]);

        return { columns, rows: data };

      }

      if (data && typeof data === 'object') {

        // try to find an array property

        for (const key of Object.keys(data)) {

          if (Array.isArray(data[key]) && data[key].length > 0) {

            const columns = Object.keys(data[key][0]);

            return { columns, rows: data[key] };

          }

        }

      }

    } catch {}

    return { columns: [], rows: [] };

  }

  // ── Date helpers ─────────────────────────────────────────────

  function parseDate(val) {

    if (!val) return null;

    const d = new Date(val);

    return isNaN(d.getTime()) ? null : d;

  }

  function dateDiffYears(dateStr) {

    const d = parseDate(dateStr);

    if (!d) return null;

    const today = new Date();

    let age = today.getFullYear() - d.getFullYear();

    const m = today.getMonth() - d.getMonth();

    if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;

    return age;

  }

  // ── Evaluate formula ─────────────────────────────────────────

  function evalFormula(formula, row) {

    // Replace column references like {ColName} with values

    let expr = formula.replace(/\{([^}]+)\}/g, (_, col) => {

      const v = row[col];

      return v !== undefined ? JSON.stringify(v) : 'null';

    });

    // Replace bare column names that exist in the row

    Object.keys(row).forEach(col => {

      const safeCol = col.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const re = new RegExp(`\\b${safeCol}\\b`, 'g');

      if (expr.includes(col)) {

        expr = expr.replace(re, JSON.stringify(row[col]));

      }

    });

    // Special functions

    expr = expr.replace(/datediff\(([^)]+)\)/g, (_, arg) => {

      const val = arg.startsWith('"') ? JSON.parse(arg) : row[arg.trim()];

      const years = dateDiffYears(val);

      return years !== null ? years : 'null';

    });

    // operator(PhoneCol) → detect carrier from phone prefix

    expr = expr.replace(/operator\(([^)]+)\)/g, (_, arg) => {

      const phone = String(row[arg.trim()] || '');

      if (/^\+91-?9[6-9]/.test(phone) || /^9[6-9]/.test(phone)) return '"Vodafone"';

      if (/^\+91-?8[0-9]/.test(phone) || /^8[0-9]/.test(phone)) return '"Airtel"';

      if (/^\+91-?7[0-9]/.test(phone) || /^7[0-9]/.test(phone)) return '"BSNL"';

      if (/^\+91-?6[0-9]/.test(phone)) return '"Jio"';

      if (/^\+1/.test(phone)) return '"AT&T"';

      if (/^\+44/.test(phone)) return '"BT"';

      return '"Unknown"';

    });

    expr = expr.replace(/today\(\)/g, `"${new Date().toISOString().split('T')[0]}"`);
    expr = expr.replace(/now\(\)/g, `"${new Date().toISOString()}"`);
    expr = expr.replace(/upper\(([^)]+)\)/g, (_, a) => `(${a}||"").toUpperCase()`);
    expr = expr.replace(/lower\(([^)]+)\)/g, (_, a) => `(${a}||"").toLowerCase()`);
    expr = expr.replace(/trim\(([^)]+)\)/g, (_, a) => `(${a}||"").trim()`);
    expr = expr.replace(/len\(([^)]+)\)/g, (_, a) => `(${a}||"").length`);

    try {
      // eslint-disable-next-line no-new-func
      return Function(`"use strict"; return (${expr})`)();
    } catch {
      return null;
    }
  }

      // ── Step Executors ───────────────────────────────────────────

  const steps = {

    // Source nodes — build initial dataset
    async source(node, state, wf) {
      const subtype = node.config?.subtype || node.subtype || node.type;
      if (subtype === 'db') {
        const connectionString = node.config?.connectionString;
        const queryText = node.config?.query || node.config?.queryText;
        if (!connectionString || !queryText) {
          throw new Error('Database source configuration is missing connection string or query.');
        }
        // Extract host from connectionString to build Neon URL
        let host;
        const hostMatch = connectionString.match(/@([^/]+)/);
        if (hostMatch) {
          host = hostMatch[1];
        } else {
          throw new Error('Invalid connection string. Could not parse database host.');
        }
        const url = `https://${host}/sql`;
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Neon-Connection-String': connectionString
            },
            body: JSON.stringify({ query: queryText, params: [] })
          });
          if (!res.ok) {
            const errBody = await res.text();
            throw new Error(`HTTP error! status: ${res.status}, body: ${errBody}`);
          }
          const data = await res.json();
          if (data && data.rows && data.fields) {
            const columns = data.fields.map(f => f.name);
            const rows = data.rows;
            return { columns, rows };
          } else {
            throw new Error(data.message || 'Failed to fetch query results. Database response is invalid.');
          }
        } catch (e) {
          throw new Error(`Database query failed: ${e.message}`);
        }
      }

      if (node.config?.csvText) {
        const { columns, rows } = parseCSV(node.config.csvText);
        return { columns, rows };
      }
      if (node.config?.jsonText) {
        return parseJSON(node.config.jsonText);
      }
      // Use uploaded file data if available on workflow
      if (wf && wf._uploadedData) {
        return { columns: wf._uploadedData.columns, rows: wf._uploadedData.rows };
      }
      if (node.config?.sampleData && node.config?.columns) {
        const columns = node.config.columns;
        const rows = node.config.sampleData.map(r => {
          const row = {};
          columns.forEach((c, i) => row[c] = r[i] !== undefined ? r[i] : '');
          return row;
        });
        return { columns, rows };
      }
      // Generate minimal sample
      return {
        columns: ['ID', 'Name', 'DOB', 'Country', 'Phone', 'Amount'],
        rows: [
          { ID:'1', Name:'Alice',   DOB:'1990-05-12', Country:'India',   Phone:'+91-9876543210', Amount:'1200' },
          { ID:'2', Name:'Bob',     DOB:'1985-11-23', Country:'USA',     Phone:'+1-2025551234',  Amount:'3400' },
          { ID:'3', Name:'Carol',   DOB:'1992-03-08', Country:'Germany', Phone:'+91-8012345678', Amount:'2100' },
          { ID:'4', Name:'David',   DOB:'1978-07-30', Country:'India',   Phone:'+91-7712345678', Amount:'560'  },
          { ID:'5', Name:'Emma',    DOB:'1995-01-15', Country:'UK',      Phone:'+44-7912345678', Amount:'4200' },
        ],
      };
    },

// Add new column
    add_column(node, state) {

      const { targetColumn, formula, sourceColumn, subtype } = node.config || {};

      if (!targetColumn) return state;

      const rows = state.rows.map(row => {

        let val;

        if (formula) {

          val = evalFormula(formula, row);

        } else if (sourceColumn && subtype === 'add_column') {

          val = dateDiffYears(row[sourceColumn]);

        } else {

          val = null;

        }

        return { ...row, [targetColumn]: val };

      });

      const columns = state.columns.includes(targetColumn)

        ? state.columns

        : [...state.columns, targetColumn];

      return { columns, rows };

    },

    // Rename columns

    rename_column(node, state) {

      const renames = node.config?.renames || {};

      const columns = state.columns.map(c => renames[c] || c);

      const rows = state.rows.map(row => {

        const newRow = {};

        Object.keys(row).forEach(k => {

          newRow[renames[k] || k] = row[k];

        });

        return newRow;

      });

      return { columns, rows };

    },

    // Delete columns

    delete_column(node, state) {

      const toDelete = node.config?.columns || [];

      const columns = state.columns.filter(c => !toDelete.includes(c));

      const rows = state.rows.map(row => {

        const newRow = { ...row };

        toDelete.forEach(c => delete newRow[c]);

        return newRow;

      });

      return { columns, rows };

    },

    // Lookup map

    lookup_map(node, state) {

      const { sourceColumn, targetColumn, map = {} } = node.config || {};

      if (!sourceColumn || !targetColumn) return state;

      const rows = state.rows.map(row => ({

        ...row,

        [targetColumn]: map[row[sourceColumn]] || row[sourceColumn] || '',

      }));

      const columns = state.columns.includes(targetColumn)

        ? state.columns

        : [...state.columns, targetColumn];

      return { columns, rows };

    },

    // Filter rows

    row_filter(node, state) {

      const { column, operator, value } = node.config || {};

      if (!column || !operator) return state;

      const rows = state.rows.filter(row => {

        const cell = String(row[column] || '');

        const val = String(value || '');

        switch (operator) {

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

      });

      return { ...state, rows };

    },

    // Replace values

    replace_value(node, state) {

      const { column, find, replace } = node.config || {};

      if (!column) return state;

      const rows = state.rows.map(row => ({

        ...row,

        [column]: String(row[column] || '').replace(new RegExp(find || '', 'g'), replace || ''),

      }));

      return { ...state, rows };

    },

    // Text transform

    text_transform(node, state) {

      const { column, operation } = node.config || {};

      if (!column || !operation) return state;

      const fn = { upper: s => s.toUpperCase(), lower: s => s.toLowerCase(), trim: s => s.trim(), title: s => s.replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.substr(1).toLowerCase()) }[operation] || (s => s);

      const rows = state.rows.map(row => ({ ...row, [column]: fn(String(row[column] || '')) }));

      return { ...state, rows };

    },

    // Output — just pass through (download happens in UI)

    output(node, state) { return state; },

    csv(node, state) { return state; },

    json_out(node, state) { return state; },

    // Data Mapper

    mapping(node, state) {

      const mappings = node.config?.mappings || [];

      const keepUnmapped = !!node.config?.keepUnmapped;

      if (!mappings.length) return state;

      const newRows = state.rows.map(row => {

        const newRow = {};

        if (keepUnmapped) Object.assign(newRow, row);

        mappings.forEach(m => {

          let val = m.source ? row[m.source] : undefined;

          // Default value

          if (val === undefined || val === null || val === '') {

            val = m.defaultValue !== undefined ? m.defaultValue : '';

          }

          // Simple transforms

          if (typeof val === 'string') {

            if (m.transform === 'trim') val = val.trim();

            else if (m.transform === 'upper') val = val.toUpperCase();

            else if (m.transform === 'lower') val = val.toLowerCase();

            else if (m.transform === 'title') {

              val = val.replace(/\b\w/g, c => c.toUpperCase());

            }

          }

          // Type conversion

          if (m.type === 'number') {

            const n = parseFloat(val);

            val = isNaN(n) ? 0 : n;

          } else if (m.type === 'string') {

            val = val !== null && val !== undefined ? String(val) : '';

          } else if (m.type === 'boolean') {

            val = String(val).toLowerCase() === 'true' || val === true || val === 1 || String(val) === '1';

          } else if (m.type === 'date') {

            const d = Date.parse(val);

            val = isNaN(d) ? '' : new Date(d).toISOString().split('T')[0];

          }

          // Conditional logic / formula

          if (m.condExpr) {

            const tempRow = { ...row, [m.target]: val };

            val = evalFormula(m.condExpr, tempRow);

          }

          newRow[m.target || m.source] = val;

        });

        return newRow;

      });

      const columns = mappings.map(m => m.target || m.source).filter(Boolean);

      if (keepUnmapped) {

        state.columns.forEach(c => {

          if (!columns.includes(c)) columns.push(c);

        });

      }

      return { columns, rows: newRows };

    },

    // Rule Engine

    rule_engine(node, state) {

      const rules = node.config?.rules || [];

      const groupOp = node.config?.groupOp || 'AND';

      const action = node.config?.action || 'flag';

      const errorMsg = node.config?.errorMessage || 'Validation failed';

      if (!rules.length) return state;

      const evaluateRule = (r, row) => {

        const cell = String(row[r.column] ?? '');

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

      const newRows = state.rows.filter(row => {

        const matches = rules.map(r => evaluateRule(r, row));

        const isRulePassed = groupOp === 'AND'

          ? matches.every(m => m === true)

          : matches.some(m => m === true);

        if (action === 'filter') {

          return isRulePassed;

        } else {

          row['_validation_status'] = isRulePassed ? 'PASS' : 'FAIL';

          row['_validation_details'] = isRulePassed ? '' : errorMsg;

          return true;

        }

      });

      const columns = [...state.columns];

      if (action === 'flag') {

        if (!columns.includes('_validation_status')) columns.push('_validation_status');

        if (!columns.includes('_validation_details')) columns.push('_validation_details');

      }

      return { columns, rows: newRows };

    },

  };

  // ── Execute workflow ─────────────────────────────────────────

  async function run(workflow) {

    const t0 = Date.now();

    let state = { columns: [], rows: [] };

    const errors = [];

    // Topological sort (BFS from source nodes)

    const nodeMap = {};

    workflow.nodes.forEach(n => nodeMap[n.id] = n);

    const inDegree = {};

    workflow.nodes.forEach(n => inDegree[n.id] = 0);

    workflow.edges.forEach(e => { if (inDegree[e.to] !== undefined) inDegree[e.to]++; });

    const queue = workflow.nodes.filter(n => inDegree[n.id] === 0);

    const order = [];

    const visited = new Set();

    while (queue.length) {

      const node = queue.shift();

      if (visited.has(node.id)) continue;

      visited.add(node.id);

      order.push(node);

      workflow.edges.filter(e => e.from === node.id).forEach(e => {

        inDegree[e.to]--;

        if (inDegree[e.to] === 0) queue.push(nodeMap[e.to]);

      });

    }

    // Append any remaining not reached

    workflow.nodes.forEach(n => { if (!visited.has(n.id)) order.push(n); });

    const nodeStates = {};

    const defaultState = workflow._uploadedData

      ? { columns: workflow._uploadedData.columns, rows: workflow._uploadedData.rows }

      : { columns: [], rows: [] };

    // Execute steps

    for (const node of order) {

      try {

        const incoming = workflow.edges.filter(e => e.to === node.id);

        let inputState = null;

        if (incoming.length > 0) {

          // Find the source state from the first incoming connection

          inputState = nodeStates[incoming[0].from];

        }

        // Fallback to default state if no input state is found

        if (!inputState) {

          inputState = { columns: [...defaultState.columns], rows: defaultState.rows.map(r => ({ ...r })) };

        } else {

          // Deep copy the input state to avoid mutating previous node states

          inputState = { columns: [...inputState.columns], rows: inputState.rows.map(r => ({ ...r })) };

        }

        const subtype = node.config?.subtype || node.subtype || node.type;

        let executor = steps[subtype] || steps[node.type];

        if (node.type === 'source') {

          executor = steps['source'];

        } else if (node.type === 'output') {

          executor = steps['output'];

        }

        let outState = inputState;

        if (executor) {

          outState = (await executor(node, inputState, workflow)) || inputState;

        }

        nodeStates[node.id] = outState;

        state = outState; // Keep track of the last executed state

      } catch (err) {

        errors.push(`Node "${node.label}": ${err.message}`);

      }

    }

    // Prefer output node's state for final preview if one exists

    const outputNodes = order.filter(n => n.type === 'output');

    if (outputNodes.length > 0) {

      const outNode = outputNodes[outputNodes.length - 1];

      if (nodeStates[outNode.id]) {

        state = nodeStates[outNode.id];

      }

    }

    const duration = Date.now() - t0;

    return { success: errors.length === 0, state, duration, errors };

  }

  // ── AI Prompt Parser ─────────────────────────────────────────

  // Converts natural language to workflow node specs.

  // Handles broad vocabulary: make/set/change/update/mark/assign/turn/flag

  // Handles no-space operators: TRESTBPS>145, age>=18

  // Handles fuzzy column matching against actual data columns

  function parsePrompt(text, columns = []) {

    const result = [];

    const t = text.trim();

    let currentContextCol = null;

    let conditionExpr = null;

    let actionClause = t;

    // Check for "in <col> column there is <val> <action>"

    let condPrefixMatch = t.match(/^(?:in|for|where)\s+([\w\s]+?)(?:\s+column)?\s+(?:there\s+is|is|has|=)\s+([\w\s"']+?)(?:\s+then|,|\s)+(.*)$/i);

    if (condPrefixMatch) {

      const condColName = condPrefixMatch[1].trim();

      const condVal = condPrefixMatch[2].trim().replace(/^["']|["']$/g, '');

      

      let condCol = columns.find(c => c.toLowerCase() === condColName.toLowerCase()) || 

                    columns.find(c => c.toLowerCase().startsWith(condColName.toLowerCase())) || 

                    columns.find(c => c.toLowerCase().includes(condColName.toLowerCase())) || 

                    condColName;

      conditionExpr = `(String({${condCol}}).toLowerCase().includes(${JSON.stringify(condVal.toLowerCase())}))`;

      currentContextCol = condCol;

      actionClause = condPrefixMatch[3].trim();

    } else {

      // Check for leading "if <cond> <action>"

      const ifMatch = t.match(/^(?:if|when|where)\s+(.+?)(?:\s+then|,|\s)+(set|change|make|update|mark|assign|convert|turn|put|flag|replace|force|write|fill|populate|uppercase|lowercase|trim|remove|delete|drop|rename)\s+(.*)$/i);

      if (ifMatch) {

        const condStr = ifMatch[1].trim();

        const mCondSym = condStr.match(/^([\w\s]+?)\s*(>=|<=|!=|<>|==|=|>|<)\s*(.+)$/i);

        const mCondWord = condStr.match(/^([\w\s]+?)\s+(is not|not equal(?:\s+to)?|not equals|contains|starts\s+with|ends\s+with|equals|equal\s+to|is|gte|lte)\s+(.*)$/i);

        const condColName = mCondSym ? mCondSym[1] : (mCondWord ? mCondWord[1] : null);

        if (condColName) {

          const condCol = columns.find(c => c.toLowerCase() === condColName.trim().toLowerCase()) || 

                          columns.find(c => c.toLowerCase().startsWith(condColName.trim().toLowerCase())) || 

                          columns.find(c => c.toLowerCase().includes(condColName.trim().toLowerCase())) || 

                          condColName.trim();

          

          const op = mCondSym ? mCondSym[2] : mCondWord[2];

          const condVal = mCondSym ? mCondSym[3].trim() : mCondWord[3].trim();

          

          const opClean = op.trim().toLowerCase().replace(/\s+/g, ' ');

          const numVal = parseFloat(condVal);

          const isNum = !isNaN(numVal) && condVal.trim() !== '';

          

          if (opClean === '=' || opClean === '==' || opClean === 'is' || opClean === 'equals' || opClean === 'equal to') {

            conditionExpr = `(String({${condCol}}).toLowerCase() === String(${JSON.stringify(condVal.trim())}).toLowerCase())`;

          } else if (opClean === '!=' || opClean === '<>' || opClean === 'is not' || opClean === 'not equal to' || opClean === 'not equals') {

            conditionExpr = `(String({${condCol}}).toLowerCase() !== String(${JSON.stringify(condVal.trim())}).toLowerCase())`;

          } else if (opClean === '>') {

            conditionExpr = `(parseFloat({${condCol}}) > ${numVal})`;

          } else if (opClean === '<') {

            conditionExpr = `(parseFloat({${condCol}}) < ${numVal})`;

          } else if (opClean === '>=') {

            conditionExpr = `(parseFloat({${condCol}}) >= ${numVal})`;

          } else if (opClean === '<=') {

            conditionExpr = `(parseFloat({${condCol}}) <= ${numVal})`;

          } else if (opClean === 'contains' || opClean === 'includes') {

            conditionExpr = `(String({${condCol}}).toLowerCase().includes(${JSON.stringify(condVal.trim().toLowerCase())}))`;

          } else if (opClean === 'starts with' || opClean === 'startswith') {

            conditionExpr = `(String({${condCol}}).toLowerCase().startsWith(${JSON.stringify(condVal.trim().toLowerCase())}))`;

          } else if (opClean === 'ends with' || opClean === 'endswith') {

            conditionExpr = `(String({${condCol}}).toLowerCase().endsWith(${JSON.stringify(condVal.trim().toLowerCase())}))`;

          } else {

            conditionExpr = `(String({${condCol}}).toLowerCase() === ${JSON.stringify(condVal.trim().toLowerCase())})`;

          }

          currentContextCol = condCol;

          actionClause = (ifMatch[2] + ' ' + ifMatch[3]).trim();

        }

      }

    }

    const makeConditional = (actionNode, condExpr, ctxCol) => {

      if (!condExpr) return actionNode;

      const sub = actionNode.subtype;

      if (sub === 'add_column') {

        const formula = actionNode.config.formula;

        const target = actionNode.config.targetColumn;

        const fallback = columns.includes(target) ? `{${target}}` : '""';

        return {

          type: 'transform',

          subtype: 'add_column',

          label: `If ${ctxCol} → Set ${target}`,

          config: {

            subtype: 'add_column',

            targetColumn: target,

            formula: `${condExpr} ? (${formula}) : ${fallback}`

          }

        };

      }

      if (sub === 'replace_value') {

        const col = actionNode.config.column;

        const findStr = actionNode.config.find;

        const replaceStr = actionNode.config.replace;

        const fallback = `{${col}}`;

        return {

          type: 'transform',

          subtype: 'add_column',

          label: `If ${ctxCol} → Replace in ${col}`,

          config: {

            subtype: 'add_column',

            targetColumn: col,

            formula: `${condExpr} ? String(${fallback}).replace(new RegExp(${JSON.stringify(findStr)}, "g"), ${JSON.stringify(replaceStr)}) : ${fallback}`

          }

        };

      }

      if (sub === 'text_transform') {

        const col = actionNode.config.column;

        const op = actionNode.config.operation;

        const fallback = `{${col}}`;

        let fnExpr = 's';

        if (op === 'upper') fnExpr = 'String(s).toUpperCase()';

        else if (op === 'lower') fnExpr = 'String(s).toLowerCase()';

        else if (op === 'trim') fnExpr = 'String(s).trim()';

        else if (op === 'title') fnExpr = 'String(s).replace(/\\w\\S*/g, t => t.charAt(0).toUpperCase() + t.substr(1).toLowerCase())';

        

        return {

          type: 'transform',

          subtype: 'add_column',

          label: `If ${ctxCol} → ${op} ${col}`,

          config: {

            subtype: 'add_column',

            targetColumn: col,

            formula: `${condExpr} ? ((s => ${fnExpr})(${fallback})) : ${fallback}`

          }

        };

      }

      return actionNode;

    };

    // ── Helper: Levenshtein distance for spelling corrections ──

    const levenshtein = (a, b) => {

      const matrix = [];

      for (let i = 0; i <= b.length; i++) matrix[i] = [i];

      for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

      for (let i = 1; i <= b.length; i++) {

        for (let j = 1; j <= a.length; j++) {

          if (b.charAt(i - 1) === a.charAt(j - 1)) {

            matrix[i][j] = matrix[i - 1][j - 1];

          } else {

            matrix[i][j] = Math.min(

              matrix[i - 1][j - 1] + 1, // substitution

              matrix[i][j - 1] + 1,     // insertion

              matrix[i - 1][j] + 1      // deletion

            );

          }

        }

      }

      return matrix[b.length][a.length];

    };

    // ── Helper: case-insensitive fuzzy column lookup ──────────

    const findCol = (name) => {

      if (!name) return name;

      const cleaned = name.trim().replace(/^["']|["']$/g, '').toLowerCase();

      // Check context references

      if (currentContextCol && /^(?:that\s+name|that\s+column|this\s+name|this\s+column|it|itself)$/i.test(cleaned)) {

        return currentContextCol;

      }

      // Exact match first

      let found = columns.find(c => c.toLowerCase() === cleaned);

      if (found) return found;

      // Starts-with match

      found = columns.find(c => c.toLowerCase().startsWith(cleaned));

      if (found) return found;

      // Contains match (one-way only, prevent incorrect reverse matching)

      found = columns.find(c => c.toLowerCase().includes(cleaned));

      if (found) return found;

      // Spelling correction (Levenshtein distance <= 2)

      found = columns.find(c => levenshtein(c.toLowerCase(), cleaned) <= 2);

      if (found) return found;

      // Return the raw name as-is (might be a new column)

      return name.trim().replace(/^["']|["']$/g, '');

    };

    const findColByPattern = (...patterns) =>

      columns.find(c => patterns.some(p => p.test(c))) || null;

    // ── Helper: build condition expression from parsed parts ──

    const buildCondExpr = (condCol, op, condVal) => {

      const opClean = op.trim().toLowerCase().replace(/\s+/g, ' ');

      const numVal = parseFloat(condVal);

      const isNum = !isNaN(numVal) && condVal.trim() !== '';

      if (opClean === '=' || opClean === '==' || opClean === 'is' || opClean === 'equals' || opClean === 'equal to')

        return `(String({${condCol}}).toLowerCase() === String(${JSON.stringify(condVal.trim())}).toLowerCase())`;

      if (opClean === '!=' || opClean === '<>' || opClean === 'is not' || opClean === 'not equal to' || opClean === 'not equals')

        return `(String({${condCol}}).toLowerCase() !== String(${JSON.stringify(condVal.trim())}).toLowerCase())`;

      if (opClean === '>')

        return `(parseFloat({${condCol}}) > ${numVal})`;

      if (opClean === '<')

        return `(parseFloat({${condCol}}) < ${numVal})`;

      if (opClean === '>=')

        return `(parseFloat({${condCol}}) >= ${numVal})`;

      if (opClean === '<=')

        return `(parseFloat({${condCol}}) <= ${numVal})`;

      if (opClean === 'contains' || opClean === 'includes')

        return `(String({${condCol}}).toLowerCase().includes(${JSON.stringify(condVal.trim().toLowerCase())}))`;

      if (opClean === 'starts with' || opClean === 'startswith')

        return `(String({${condCol}}).toLowerCase().startsWith(${JSON.stringify(condVal.trim().toLowerCase())}))`;

      if (opClean === 'ends with' || opClean === 'endswith')

        return `(String({${condCol}}).toLowerCase().endsWith(${JSON.stringify(condVal.trim().toLowerCase())}))`;

      // Fallback: equality

      return `(String({${condCol}}).toLowerCase() === ${JSON.stringify(condVal.trim().toLowerCase())})`;

    };

    // ── Helper: normalise an operator word ────────────────────

    const normOp = (s) => {

      const k = s.trim().toLowerCase().replace(/\s+/g,' ');

      if (k === '=' || k === '==' || k === 'is' || k === 'equals' || k === 'equal to') return 'equals';

      if (k === '!=' || k === '<>' || k === 'is not' || k === 'not equal' || k === 'not equal to') return 'not_equals';

      if (k === '>') return 'gt';

      if (k === '<') return 'lt';

      if (k === '>=') return 'gte';

      if (k === '<=') return 'lte';

      if (k === 'contains' || k === 'includes') return 'contains';

      if (k.startsWith('starts')) return 'starts_with';

      if (k.startsWith('ends')) return 'ends_with';

      return 'equals';

    };

    // Parse a condition string like "age > 60" or "TRESTBPS>=145" or "region is North"

    const parseCondition = (s) => {

      let m = s.match(/^([\w\s]+?)\s*(>=|<=|!=|<>|==|=|>|<)\s*(.+)$/i);

      if (m) return { condCol: findCol(m[1]), op: m[2], condVal: m[3].trim() };

      m = s.match(/^([\w\s]+?)\s+(is not|not equal(?:\s+to)?|not equals|contains|starts\s+with|ends\s+with|equals|equal\s+to|is|gte|lte)\s+(.*)$/i);

      if (m) return { condCol: findCol(m[1]), op: m[2], condVal: m[3].trim() };

      return null;

    };

    const ACT = '(?:set|change|make|update|mark|assign|convert|turn|put|flag|replace|force|write|fill|populate)';

    const CONJ = '(?:to(?:\s+be)?|as|with|=|:)';

    const ifThenRe = new RegExp(

      `^if\\s+(.+?)\\s+(?:then\\s+)?\${ACT}\\s+([\\w\\s]+?)\\s+\${CONJ}\\s*["']?([^"']+?)["']?\\s*$`, 'i'

    );

    const ifThenRe2 = new RegExp(

      `^if\\s+(.+?)\\s+(?:then\\s+)?\${ACT}\\s+([\\w]+)\\s+(\\S+)\\s*$`, 'i'

    );

    let condMatched = false;

    const tryIfThen = (m, condStr, targetStr, valStr) => {

      const cond = parseCondition(condStr.trim());

      if (!cond) return false;

      const targetCol = findCol(targetStr.trim());

      const targetVal = valStr.trim().replace(/^["']|["']$/g, '');

      const condExpr = buildCondExpr(cond.condCol, cond.op, cond.condVal);

      const label = `If ${cond.condCol} ${cond.op} ${cond.condVal} → set ${targetCol} = ${targetVal}`;

      result.push({

        type: 'transform', subtype: 'add_column', label,

        config: {

          subtype: 'add_column',

          targetColumn: targetCol,

          formula: `${condExpr} ? ${JSON.stringify(targetVal)} : {${targetCol}}`

        }

      });

      return true;

    };

    if (!conditionExpr) {

      let m = t.match(ifThenRe);

      if (m && tryIfThen(m, m[1], m[2], m[3])) condMatched = true;

      if (!condMatched) {

        m = t.match(ifThenRe2);

        if (m && tryIfThen(m, m[1], m[2], m[3])) condMatched = true;

      }

      if (!condMatched) {

        const revRe = new RegExp(

          `^\${ACT}\\s+([\\w\\s]+?)\\s+\${CONJ}\\s*["']?([^"']+?)["']?\\s+(?:if|when|where)\\s+(.+)$`, 'i'

        );

        m = t.match(revRe);

        if (m) {

          const cond = parseCondition(m[3].trim());

          if (cond) {

            const targetCol = findCol(m[1].trim());

            const targetVal = m[2].trim().replace(/^["']|["']$/g, '');

            const condExpr = buildCondExpr(cond.condCol, cond.op, cond.condVal);

            result.push({

              type: 'transform', subtype: 'add_column',

              label: `If ${cond.condCol} ${cond.op} ${cond.condVal} → set ${targetCol} = ${targetVal}`,

              config: {

                subtype: 'add_column', targetColumn: targetCol,

                formula: `${condExpr} ? ${JSON.stringify(targetVal)} : {${targetCol}}`

              }

            });

            condMatched = true;

          }

        }

      }

      if (!condMatched) {

        const emptyRe = /^if\s+([\w\s]+?)\s+is\s+(not\s+)?empty\s+then\s+\S+\s+([\w\s]+?)\s+(?:to|as|=)\s*["']?([^"']+?)["']?\s*$/i;

        m = t.match(emptyRe);

        if (m) {

          const condCol = findCol(m[1]);

          const isNot = !!m[2];

          const targetCol = findCol(m[3]);

          const targetVal = m[4].trim();

          const condExpr = isNot

            ? `({${condCol}} && String({${condCol}}).trim() !== "")`

            : `(!{${condCol}} || String({${condCol}}).trim() === "")`;

          result.push({

            type: 'transform', subtype: 'add_column',

            label: `If ${condCol} ${isNot ? 'is not' : 'is'} empty → set ${targetCol} = ${targetVal}`,

            config: {

              subtype: 'add_column', targetColumn: targetCol,

              formula: `${condExpr} ? ${JSON.stringify(targetVal)} : {${targetCol}}`

            }

          });

          condMatched = true;

        }

      }

    }

    if (!condMatched) {

      const clauses = actionClause.split(/\b(?:and|,)\b/i).map(s => s.trim()).filter(Boolean);

      for (const clause of clauses) {

        const cl = clause.toLowerCase();

        let handled = false;

        const beforeLen = result.length;

        // A. Age calculation from DOB column

        if (/datediff|calcul.*age|add\s+age|compute\s+age|get\s+age|age\s+from|age\s+of/i.test(cl) || (/birth|born|dob/i.test(cl) && /\bage\b/i.test(cl))) {

          const dobCol = findColByPattern(/dob|birth|birthday|born/i) || 'DOB';

          result.push({

            type: 'transform', subtype: 'add_column', label: `Add Age from ${dobCol}`,

            config: { subtype: 'add_column', targetColumn: 'Age', formula: `datediff(${dobCol})`, sourceColumn: dobCol }

          });

          handled = true;

        }

        // B. Country → ISO code

        if (!handled && /country.*(?:to|iso|code)|iso.*code|map.*country|convert.*country/i.test(cl)) {

          const col = findColByPattern(/country|nation/i) || 'Country';

          result.push({

            type: 'transform', subtype: 'lookup_map', label: `${col} to ISO Code`,

            config: {

              subtype: 'lookup_map', sourceColumn: col, targetColumn: 'CountryCode',

              map: {

                India:'IND', INDIA:'IND', india:'IND', USA:'USA', 'United States':'USA',

                Germany:'DEU', germany:'DEU', UK:'GBR', 'United Kingdom':'GBR', France:'FRA',

                China:'CHN', Japan:'JPN', Australia:'AUS', Canada:'CAN', Brazil:'BRA',

                Russia:'RUS', Italy:'ITA', Spain:'ESP', Singapore:'SGP', Netherlands:'NLD'

              }

            }

          });

          handled = true;

        }

        // C. Phone operator detection

        if (!handled && /operator|carrier|telecom|mobile.*(?:company|provider)|detect.*(?:operator|carrier)/i.test(cl)) {

          const col = findColByPattern(/phone|mobile|cell|tele/i) || 'Phone';

          result.push({

            type: 'transform', subtype: 'add_column', label: `Detect Operator from ${col}`,

            config: { subtype: 'add_column', targetColumn: 'Operator', formula: `operator(${col})`, sourceColumn: col }

          });

          handled = true;

        }

        // D. Row filter: "filter/keep/where col op val"

        if (!handled) {

          const fm = clause.match(/(?:filter|keep|show|where)\s+([\w\s]+?)\s*(>=|<=|!=|<>|>|<|==|(?:is not|is|contains|starts\s+with|ends\s+with|equals))\s*["']?([^"']+?)["']?\s*$/i);

          if (fm) {

            const col = findCol(fm[1]);

            const op = normOp(fm[2]);

            const val = fm[3].trim();

            result.push({

              type: 'filter', subtype: 'row_filter', label: `Filter: ${col} ${op.replace(/_/g,' ')} ${val}`,

              config: { subtype: 'row_filter', column: col, operator: op, value: val }

            });

            handled = true;

          }

        }

        // G. Text transforms: upper, lower, trim, title-case (Moved before Rename & Delete)

        if (!handled) {

          const tm = clause.match(/(?:uppercase|upper(?:case)?)\s+([\w\s]+)/i) ||

                     clause.match(/([\w\s]+)\s+to\s+upper(?:case)?/i);

          if (tm) {

            const col = findCol(tm[1]);

            result.push({ type: 'transform', subtype: 'text_transform', label: `Uppercase ${col}`, config: { subtype: 'text_transform', column: col, operation: 'upper' } });

            handled = true;

          }

        }

        if (!handled) {

          const tm = clause.match(/(?:lowercase|lower(?:case)?)\s+([\w\s]+)/i) ||

                     clause.match(/([\w\s]+)\s+to\s+lower(?:case)?/i);

          if (tm) {

            const col = findCol(tm[1]);

            result.push({ type: 'transform', subtype: 'text_transform', label: `Lowercase ${col}`, config: { subtype: 'text_transform', column: col, operation: 'lower' } });

            handled = true;

          }

        }

        if (!handled) {

          const tm = clause.match(/trim\s+([\w\s]+)/i);

          if (tm) {

            const col = findCol(tm[1]);

            result.push({ type: 'transform', subtype: 'text_transform', label: `Trim ${col}`, config: { subtype: 'text_transform', column: col, operation: 'trim' } });

            handled = true;

          }

        }

        // H. Remove prefix/suffix: "remove +91 from Phone" (Moved before Rename & Delete)

        if (!handled) {

          const pm = clause.match(/remove\s+["']?([^"\s]+)["']?\s+(?:from|in)\s+([\w\s]+)/i);

          if (pm) {

            const col = findCol(pm[2]);

            result.push({

              type: 'transform', subtype: 'replace_value', label: `Remove "${pm[1]}" from ${col}`,

              config: { subtype: 'replace_value', column: col, find: pm[1].replace(/[+]/g,'\\+'), replace: '' }

            });

            handled = true;

          }

        }

        // I. Replace value: "replace X with Y in Col" (Moved before Rename & Delete)

        if (!handled) {

          const rv = clause.match(/replace\s+["']?([^"\s]+)["']?\s+with\s+["']?([^"\s]*?)["']?\s+(?:in|for|on)\s+([\w\s]+)/i);

          if (rv) {

            const col = findCol(rv[3]);

            result.push({

              type: 'transform', subtype: 'replace_value', label: `Replace in ${col}`,

              config: { subtype: 'replace_value', column: col, find: rv[1], replace: rv[2] }

            });

            handled = true;

          }

        }

        // E. Rename column: "rename X to Y" / "rename X as Y"

        if (!handled) {

          const rm = clause.match(/rename\s+([\w\s]+?)\s+(?:to|as)\s+([\w\s]+)/i);

          if (rm) {

            const oldCol = findCol(rm[1]);

            const newCol = rm[2].trim();

            result.push({

              type: 'transform', subtype: 'rename_column', label: `Rename ${oldCol} to ${newCol}`,

              config: { subtype: 'rename_column', renames: { [oldCol]: newCol } }

            });

            handled = true;

          }

        }

        // F. Delete/drop/remove column

        if (!handled) {

          const dm = clause.match(/(?:delete|drop|remove)\s+(?:column\s+)?([,\w\s]+?)(?:\s+column|$|[.,])/i);

          if (dm && !/remove\s+(?:spaces|whitespace|prefix|suffix)/i.test(clause)) {

            const colList = dm[1].split(/[,\s]+/).map(s => findCol(s.trim())).filter(s => s.length > 1 && !/^(?:the|a|an)$/i.test(s));

            if (colList.length) {

              result.push({

                type: 'transform', subtype: 'delete_column', label: `Drop: ${colList.join(', ')}`,

                config: { subtype: 'delete_column', columns: colList }

              });

              handled = true;

            }

          }

        }

        // J. Generic unconditional column set: "set Col to/as val" / "make Col val" / "mark Col as val"

        if (!handled) {

          const gm = clause.match(new RegExp(`^\${ACT}\\s+([\\w\\s]+?)\\s+\${CONJ}\\s*["']?([^"']+?)["']?\\s*$`, 'i')) ||

                     clause.match(/^(?:make|mark|assign)\s+([\w\s]+?)\s+["']?([^"']+?)["']?\s*$/i);

          if (gm) {

            const col = findCol(gm[1]);

            const val = gm[2].trim().replace(/^["']|["']$/g, '');

            result.push({

              type: 'transform', subtype: 'add_column', label: `Set ${col} = ${val}`,

              config: { subtype: 'add_column', targetColumn: col, formula: JSON.stringify(val) }

            });

            handled = true;

          }

        }

        // K. Detect inline condition embedded in clause without explicit IF/THEN

        if (!handled) {

          const inlineCond = clause.match(/^([\w]+)\s*(>=|<=|!=|>|<|==)\s*([\S]+)\s+\S+\s+([\w]+)\s+([\S]+)$/i);

          if (inlineCond) {

            const cond = parseCondition(`${inlineCond[1]} ${inlineCond[2]} ${inlineCond[3]}`);

            if (cond) {

              const targetCol = findCol(inlineCond[4]);

              const targetVal = inlineCond[5].trim();

              const condExpr = buildCondExpr(cond.condCol, cond.op, cond.condVal);

              result.push({

                type: 'transform', subtype: 'add_column',

                label: `If ${cond.condCol} ${cond.op} ${cond.condVal} → set ${targetCol} = ${targetVal}`,

                config: {

                  subtype: 'add_column', targetColumn: targetCol,

                  formula: `${condExpr} ? ${JSON.stringify(targetVal)} : {${targetCol}}`

                }

              });

              handled = true;

            }

          }

        }

        // L. Math / Formula Column detection

        if (!handled) {

          const explicitFormulaMatch = clause.match(/(?:create|add|new)\s+(?:column\s+)?(?:named|called\s+)?([\w\s]+?)\s*(?:as|=Private|\bwith formula\b)\s*(.+)$/i);

          if (explicitFormulaMatch) {

            const targetCol = explicitFormulaMatch[1].trim();

            let rawFormula = explicitFormulaMatch[2].trim();

            columns.forEach(col => {

              const re = new RegExp(`\\b${col.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');

              rawFormula = rawFormula.replace(re, `{${col}}`);

            });

            result.push({

              type: 'transform', subtype: 'add_column', label: `Add Column: ${targetCol}`,

              config: { subtype: 'add_column', targetColumn: targetCol, formula: rawFormula }

            });

            handled = true;

          }

        }

        if (!handled) {

          const addMatch = clause.match(/(?:add|adding|plus)\s+([\w\s]+?|[-\d\.]+)\s+(?:to|in|for|on)\s+([\w\s]+)/i);

          if (addMatch) {

            const val1 = addMatch[1].trim();

            const col2 = findCol(addMatch[2]);

            const isNum = !isNaN(parseFloat(val1));

            let formula, label;

            if (isNum) {

              formula = `(parseFloat({${col2}}) || 0) + ${parseFloat(val1)}`;

              label = `Add ${parseFloat(val1)} to ${col2}`;

            } else {

              const col1 = findCol(val1);

              formula = `(parseFloat({${col2}}) || 0) + (parseFloat({${col1}}) || 0)`;

              label = `Add ${col1} to ${col2}`;

            }

            result.push({

              type: 'transform', subtype: 'add_column', label,

              config: { subtype: 'add_column', targetColumn: `${col2}_calc`, formula }

            });

            handled = true;

          }

        }

        if (!handled) {

          const subMatch = clause.match(/(?:subtract|subtracting|minus|sub)\s+([\w\s]+?|[-\d\.]+)\s+(?:from|in|for|on)\s+([\w\s]+)/i);

          if (subMatch) {

            const val1 = subMatch[1].trim();

            const col2 = findCol(subMatch[2]);

            const isNum = !isNaN(parseFloat(val1));

            let formula, label;

            if (isNum) {

              formula = `(parseFloat({${col2}}) || 0) - ${parseFloat(val1)}`;

              label = `Subtract ${parseFloat(val1)} from ${col2}`;

            } else {

              const col1 = findCol(val1);

              formula = `(parseFloat({${col2}}) || 0) - (parseFloat({${col1}}) || 0)`;

              label = `Subtract ${col1} from ${col2}`;

            }

            result.push({

              type: 'transform', subtype: 'add_column', label,

              config: { subtype: 'add_column', targetColumn: `${col2}_calc`, formula }

            });

            handled = true;

          }

        }

        if (!handled) {

          const mulMatch = clause.match(/(?:multiply|multiplying|mul)\s+([\w\s]+)\s+by\s+([\w\s]+?|[-\d\.]+)/i);

          if (mulMatch) {

            const col1 = findCol(mulMatch[1]);

            const val2 = mulMatch[2].trim();

            const isNum = !isNaN(parseFloat(val2));

            let formula, label;

            if (isNum) {

              formula = `(parseFloat({${col1}}) || 0) * ${parseFloat(val2)}`;

              label = `Multiply ${col1} by ${parseFloat(val2)}`;

            } else {

              const col2 = findCol(val2);

              formula = `(parseFloat({${col1}}) || 0) * (parseFloat({${col2}}) || 0)`;

              label = `Multiply ${col1} by ${col2}`;

            }

            result.push({

              type: 'transform', subtype: 'add_column', label,

              config: { subtype: 'add_column', targetColumn: `${col1}_calc`, formula }

            });

            handled = true;

          }

        }

        if (!handled) {

          const divMatch = clause.match(/(?:divide|dividing|div)\s+([\w\s]+)\s+by\s+([\w\s]+?|[-\d\.]+)/i);

          if (divMatch) {

            const col1 = findCol(divMatch[1]);

            const val2 = divMatch[2].trim();

            const isNum = !isNaN(parseFloat(val2));

            let formula, label;

            if (isNum) {

              formula = `(parseFloat({${col1}}) || 0) / ${parseFloat(val2)}`;

              label = `Divide ${col1} by ${parseFloat(val2)}`;

            } else {

              const col2 = findCol(val2);

              formula = `(parseFloat({${col1}}) || 0) / (parseFloat({${col2}}) || 0 || 1)`;

              label = `Divide ${col1} by ${col2}`;

            }

            result.push({

              type: 'transform', subtype: 'add_column', label,

              config: { subtype: 'add_column', targetColumn: `${col1}_calc`, formula }

            });

            handled = true;

          }

        }

        if (!handled) {

          const inlineMath = clause.match(/^([\w\s]+?)\s*([\+\-\*\/])\s*([\w\s]+?)\s*$/);

          if (inlineMath) {

            const col1 = findCol(inlineMath[1]);

            const op = inlineMath[2];

            const val2 = inlineMath[3].trim();

            const isNum = !isNaN(parseFloat(val2));

            let formula, label = `${col1} ${op} ${val2}`;

            if (isNum) {

              formula = `(parseFloat({${col1}}) || 0) ${op} ${parseFloat(val2)}`;

            } else {

              const col2 = findCol(val2);

              formula = `(parseFloat({${col1}}) || 0) ${op} (parseFloat({${col2}}) || 0)`;

            }

            result.push({

              type: 'transform', subtype: 'add_column', label,

              config: { subtype: 'add_column', targetColumn: `${col1}_calc`, formula }

            });

            handled = true;

          }

        }

        if (!handled && /map\s+(?:fields|columns)|schema\s+map|mapping/i.test(cl)) {

          result.push({

            type: 'transform', subtype: 'mapping', label: 'Data Mapper',

            config: { subtype: 'mapping', mappings: [], keepUnmapped: true }

          });

          handled = true;

        }

        if (!handled && /rule\s+engine|validation|validate\s+(?:data|rows)|rules/i.test(cl)) {

          result.push({

            type: 'filter', subtype: 'rule_engine', label: 'Rule Engine',

            config: { subtype: 'rule_engine', rules: [], groupOp: 'AND', action: 'flag', errorMessage: 'Validation failed' }

          });

          handled = true;

        }

        if (handled && conditionExpr) {

          for (let i = beforeLen; i < result.length; i++) {

            result[i] = makeConditional(result[i], conditionExpr, currentContextCol);

          }

        }

      }

    }

    // Deduplicate by subtype + targetColumn/column

    const seen = new Set();

    return result.filter(n => {

      const key = (n.config?.subtype||n.subtype||n.type) + '_' + (n.config?.targetColumn || n.config?.column || n.config?.sourceColumn || '');

      if (seen.has(key)) return false;

      seen.add(key);

      return true;

    });

  }

  // ── Export helpers ────────────────────────────────────────────

  function toCSVText(state) {

    const { columns, rows } = state;

    const header = columns.map(c => `"${c}"`).join(',');

    const body = rows.map(row => columns.map(c => `"${String(row[c] ?? '')}"`).join(',')).join('\n');

    return header + '\n' + body;

  }

  function toJSONText(state) {

    return JSON.stringify(state.rows, null, 2);

  }

  function downloadCSV(state, filename) {

    const text = toCSVText(state);

    const blob = new Blob([text], { type: 'text/csv' });

    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');

    a.href = url; a.download = filename || 'output.csv';

    a.click();

    URL.revokeObjectURL(url);

  }

  function downloadJSON(state, filename) {

    const text = toJSONText(state);

    const blob = new Blob([text], { type: 'application/json' });

    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');

    a.href = url; a.download = filename || 'output.json';

    a.click();

    URL.revokeObjectURL(url);

  }

  return { run, parseCSV, parseJSON, parsePrompt, toCSVText, toJSONText, downloadCSV, downloadJSON };

})();

window.Engine = Engine;

