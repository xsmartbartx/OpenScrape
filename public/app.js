const $ = (selector) => document.querySelector(selector);
let robots = [];
let runs = [];

async function api(path, options) {
  const response = await fetch(path, { headers: { 'content-type': 'application/json' }, ...options });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(data.errors?.join(' ') ?? data.error ?? 'Request failed.');
  return data;
}

async function refresh() {
  [{ robots }, { runs }] = await Promise.all([api('/api/robots'), api('/api/runs')]);
  renderRobots(); renderRuns();
}

function renderRobots() {
  $('#robot-count').textContent = `${robots.length} total`;
  $('#robot-list').innerHTML = robots.length ? robots.map((robot) => `<article class="card"><div class="card-heading"><div><h3>${escapeHtml(robot.name)}</h3><p>${escapeHtml(robot.description || 'No description')}</p></div><button class="icon menu" data-action="edit" data-id="${robot.id}" aria-label="Edit robot">⋯</button></div><a href="${escapeHtml(robot.startUrl)}" target="_blank" rel="noreferrer">${escapeHtml(robot.startUrl)}</a>${robot.rowSelector ? `<p class="repeat">Repeats <code>${escapeHtml(robot.rowSelector)}</code> · up to ${robot.maxRows ?? 50} records</p>` : ''}<div class="chips">${robot.fields.map((field) => `<span>${escapeHtml(field.name)}</span>`).join('')}</div><div class="card-actions"><button class="quiet" data-action="edit" data-id="${robot.id}">Edit</button><button class="primary" data-action="run" data-id="${robot.id}">Run now</button><button class="danger" data-action="delete" data-id="${robot.id}">Delete</button></div></article>`).join('') : '<p class="empty">No robots yet. Create one to get started.</p>';
}

function renderRuns() {
  $('#runs').innerHTML = runs.length ? runs.slice(0, 10).map((run) => { const robot = robots.find((item) => item.id === run.robotId); return `<article class="run"><div><span class="status ${run.status}">${run.status}</span><strong>${escapeHtml(robot?.name ?? 'Deleted robot')}</strong><p>${run.stats ? `${run.stats.items} item · ${run.stats.pages} page` : 'Waiting for worker'}${run.error ? ` · ${escapeHtml(run.error)}` : ''}</p></div><div class="run-actions"><time>${new Date(run.createdAt).toLocaleString()}</time><button class="quiet" data-action="details" data-id="${run.id}">Details</button>${run.status === 'success' ? `<button class="quiet" data-action="results" data-id="${run.id}">Results</button><a class="quiet link-button" href="/api/runs/${run.id}/export.csv">CSV</a>` : ''}</div></article>`; }).join('') : '<p class="empty">Runs will appear here.</p>';
}

function openRobot(robot) {
  $('#robot-form').reset(); $('#form-error').textContent = '';
  $('#dialog-title').textContent = robot ? 'Edit robot' : 'Create robot';
  $('#robot-id').value = robot?.id ?? ''; $('#name').value = robot?.name ?? ''; $('#start-url').value = robot?.startUrl ?? ''; $('#description').value = robot?.description ?? ''; $('#row-selector').value = robot?.rowSelector ?? ''; $('#max-rows').value = robot?.maxRows ?? 50; $('#fields').value = robot?.fields.map((field) => `${field.name} = ${field.selector}`).join('\n') ?? ''; $('#respect-robots').checked = robot?.respectRobotsTxt !== false;
  $('#robot-dialog').showModal();
}

function parseFields(value) {
  const fields = value.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => { const index = line.indexOf('='); return index === -1 ? null : { name: line.slice(0, index).trim(), selector: line.slice(index + 1).trim() }; });
  if (fields.some((field) => !field?.name || !field?.selector)) throw new Error('Write each field as: name = selector');
  return fields;
}

$('#new-robot').onclick = () => openRobot(); $('#close-dialog').onclick = $('#cancel').onclick = () => $('#robot-dialog').close(); $('#close-results').onclick = () => $('#result-dialog').close(); $('#refresh').onclick = refresh;
$('#robot-form').onsubmit = async (event) => { event.preventDefault(); try { const id = $('#robot-id').value; const rowSelector = $('#row-selector').value.trim(); const body = { name: $('#name').value, startUrl: $('#start-url').value, description: $('#description').value, fields: parseFields($('#fields').value), rowSelector: rowSelector || null, maxRows: Number($('#max-rows').value), respectRobotsTxt: $('#respect-robots').checked }; await api(id ? `/api/robots/${id}` : '/api/robots', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) }); $('#robot-dialog').close(); await refresh(); } catch (error) { $('#form-error').textContent = error.message; } };
document.body.onclick = async (event) => { const button = event.target.closest('[data-action]'); if (!button) return; const { action, id } = button.dataset; const robot = robots.find((item) => item.id === id); if (action === 'edit') openRobot(robot); if (action === 'delete' && confirm(`Delete ${robot.name} and its run history?`)) { await api(`/api/robots/${id}`, { method: 'DELETE' }); await refresh(); } if (action === 'run') { button.disabled = true; button.textContent = 'Queued'; await api(`/api/robots/${id}/runs`, { method: 'POST' }); await refresh(); setTimeout(refresh, 900); } if (action === 'results') { const { results } = await api(`/api/runs/${id}/results`); $('#result-content').innerHTML = results.length ? `<table><thead><tr>${Object.keys(results[0].data).map((key) => `<th>${escapeHtml(key)}</th>`).join('')}</tr></thead><tbody>${results.map((row) => `<tr>${Object.values(row.data).map((value) => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p class="empty">No results.</p>'; $('#result-dialog').showModal(); } if (action === 'details') { const { run } = await api(`/api/runs/${id}`); $('#result-content').innerHTML = `<ol class="events">${(run.events ?? []).map((item) => `<li><time>${new Date(item.at).toLocaleTimeString()}</time><span class="event-${escapeHtml(item.level)}">${escapeHtml(item.message)}</span></li>`).join('')}</ol>`; $('#result-dialog').showModal(); } };
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]); }
refresh();
