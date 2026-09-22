
let appData = {
    projects: [],
    currentProjectId: null,
    currentSceneId: null,
    dailyTime: {}
};
let editingProjectId = null; // Guarda se estamos editando um projeto existente
let draggingPortSourceId = null;
let tempMousePos = { x: 0, y: 0 };
let activeTimerInterval = null;
let activeTaskIndex = null;
let selectedColor = "#888888";

let panX = 0;
let panY = 0;
let isPanning = false;
let startX = 0;
let startY = 0;

// --- ZOOM STATE ---
let zoom = 1;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.15;

// --- CALENDAR STATE ---
let calendarViewDate = new Date();
let selectedCalendarDay = null;

// --- YEAR OVERVIEW STATE ---
let yearModalViewYear = new Date().getFullYear();
const MONTH_SHORT_LABELS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

const NODE_WIDTH = 220;
const NODE_HEIGHT = 140;

const WEEKDAY_LABELS = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
const MONTH_LABELS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];

function loadData() {
    try {
        const data = localStorage.getItem('task_manager_app_data');
        if (data) {
            appData = JSON.parse(data);
        }
    } catch (e) {
        // FALLBACK
    }
    if (!appData.dailyTime) appData.dailyTime = {};
    if (!appData.projects) appData.projects = [];
    appData.projects.forEach(p => {
        if (!p.scenes) p.scenes = [];
        if (!p.connections) p.connections = [];
    });
}

function saveData() {
    try {
        localStorage.setItem('task_manager_app_data', JSON.stringify(appData));
    } catch (e) {
        // FALLBACK
    }
    renderMetricsBar();
}

function generateId() {
    return 'id_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const d = new Date(dateString);
    return d.toLocaleDateString('en-GB') + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatDateKey(d) {
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function formatTime(totalSeconds) {
    const hrs = Math.floor((totalSeconds || 0) / 3600).toString().padStart(2, '0');
    const mins = Math.floor(((totalSeconds || 0) % 3600) / 60).toString().padStart(2, '0');
    const secs = ((totalSeconds || 0) % 60).toString().padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
}

function calculateSceneTotalTime(scene) {
    if (!scene || !scene.tasks) return 0;
    return scene.tasks.reduce((sum, task) => sum + (task.timeSpent || 0), 0);
}

function getAllScenesFlat() {
    const scenes = [];
    appData.projects.forEach(p => {
        (p.scenes || []).forEach(s => scenes.push(s));
    });
    return scenes;
}

function getAllTasksFlat() {
    const tasks = [];
    getAllScenesFlat().forEach(s => {
        (s.tasks || []).forEach(t => tasks.push(t));
    });
    return tasks;
}

window.addEventListener('DOMContentLoaded', () => {
    // TIMER DA INTRO — agendado ANTES de qualquer outra coisa,
    // para nunca ficar travado na tela FOCUS mesmo se algo abaixo falhar.
    setTimeout(() => {
        const introScreen = document.getElementById('intro-screen');
        if (introScreen) {
            introScreen.classList.add('fade-out');
        }
    }, 3200);

    // Cada etapa isolada num try/catch: se uma falhar, as outras
    // continuam rodando normalmente em vez de travar o app inteiro.
    try { loadData(); } catch (e) { console.error('Erro em loadData:', e); }
    try { renderProjects(); } catch (e) { console.error('Erro em renderProjects:', e); }
    try { setupEventListeners(); } catch (e) { console.error('Erro em setupEventListeners:', e); }
    try { renderMetricsBar(); } catch (e) { console.error('Erro em renderMetricsBar:', e); }
});

function switchView(viewName) {
    document.querySelectorAll('.view-screen').forEach(s => s.classList.remove('active'));
    const headerTitle = document.getElementById('header-title');
    const mainBtn = document.getElementById('main-action-btn');
    const backBtn = document.getElementById('back-btn');

    if (viewName === 'projects') {
        document.getElementById('projects-view').classList.add('active');
        headerTitle.textContent = 'TASKS AND SCENES';
        mainBtn.textContent = 'NEW PROJECT';
        backBtn.style.display = 'none';
        appData.currentProjectId = null;
        renderProjects();
    } else if (viewName === 'canvas') {
        document.getElementById('canvas-view').classList.add('active');
        const project = appData.projects.find(p => p.id === appData.currentProjectId);
        headerTitle.textContent = project ? project.name : 'CANVAS';
        mainBtn.textContent = 'NEW SCENE';
        backBtn.style.display = 'block';
        resetCanvasPan();
        renderCanvas();
    }
}

function renderProjects() {
    const container = document.getElementById('projects-container');
    container.innerHTML = '';

    appData.projects.forEach(project => {
        const card = document.createElement('div');
        card.className = 'project-card';
        card.style.borderLeftColor = project.color || '#888888';

        const scenesCount = project.scenes ? project.scenes.length : 0;

        card.innerHTML = `
            <div class="card-header-actions">
                <span class="card-action-btn card-edit-btn" data-id="${project.id}">EDIT</span>
                <span class="card-action-btn card-delete-btn" data-id="${project.id}">DEL</span>
            </div>
            <div class="card-title">${escapeHtml(project.name)}</div>
            <div class="card-meta">
                <span>SCENES: ${scenesCount}</span>
                <span>${formatDate(project.updatedAt).split(' ')[0]}</span>
            </div>
        `;

        card.addEventListener('click', (e) => {
            if (e.target.classList.contains('card-delete-btn')) {
                e.stopPropagation();
                deleteProject(project.id);
                return;
            }
            if (e.target.classList.contains('card-edit-btn')) {
                e.stopPropagation();
                openProjectModalForEdit(project);
                return;
            }
            appData.currentProjectId = project.id;
            switchView('canvas');
        });

        container.appendChild(card);
    });
}

function openProjectModalForCreate() {
    editingProjectId = null;
    document.getElementById('project-modal-title').textContent = 'CREATE NEW PROJECT';
    document.getElementById('project-name-input').value = '';
    selectColorOption('#888888');
    document.getElementById('project-modal').classList.add('active');
}

function openProjectModalForEdit(project) {
    editingProjectId = project.id;
    document.getElementById('project-modal-title').textContent = 'EDIT PROJECT';
    document.getElementById('project-name-input').value = project.name;
    selectColorOption(project.color || '#888888');
    document.getElementById('project-modal').classList.add('active');
}

function selectColorOption(colorHex) {
    selectedColor = colorHex;
    document.querySelectorAll('.color-card-option').forEach(opt => {
        if (opt.getAttribute('data-color') === colorHex) {
            opt.classList.add('selected');
        } else {
            opt.classList.remove('selected');
        }
    });
}

function saveProject() {
    const name = document.getElementById('project-name-input').value.trim();
    if (!name) return;

    if (editingProjectId) {
        // EDITAR PROJETO EXISTENTE
        const project = appData.projects.find(p => p.id === editingProjectId);
        if (project) {
            project.name = name;
            project.color = selectedColor;
            project.updatedAt = new Date().toISOString();
        }
    } else {
        // CRIAR NOVO PROJETO
        const newProject = {
            id: generateId(),
            name: name,
            color: selectedColor,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            scenes: [],
            connections: []
        };
        appData.projects.push(newProject);
    }

    saveData();
    renderProjects();
    document.getElementById('project-modal').classList.remove('active');
}

function deleteProject(id) {
    appData.projects = appData.projects.filter(p => p.id !== id);
    saveData();
    renderProjects();
}

function resetCanvasPan() {
    panX = 0;
    panY = 0;
    zoom = 1;
    updateCanvasTransform();
    updateZoomLabel();
}

function updateCanvasTransform() {
    const container = document.getElementById('canvas-container');
    container.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
}

function updateZoomLabel() {
    const btn = document.getElementById('zoom-reset-btn');
    if (btn) btn.textContent = `${Math.round(zoom * 100)}%`;
}

// Converte um ponto da tela (client X/Y) para coordenadas locais do canvas,
// já compensando o pan e o zoom atuais.
function getCanvasLocalPos(clientX, clientY) {
    const rect = document.getElementById('canvas-view').getBoundingClientRect();
    return {
        x: (clientX - rect.left - panX) / zoom,
        y: (clientY - rect.top - panY) / zoom
    };
}

// Aplica um novo zoom mantendo o ponto sob o cursor (ou o centro da tela) fixo.
function setZoom(newZoom, clientX, clientY) {
    newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, newZoom));
    const rect = document.getElementById('canvas-view').getBoundingClientRect();
    const cx = clientX !== undefined ? clientX - rect.left : rect.width / 2;
    const cy = clientY !== undefined ? clientY - rect.top : rect.height / 2;

    const localX = (cx - panX) / zoom;
    const localY = (cy - panY) / zoom;

    zoom = newZoom;
    panX = cx - localX * zoom;
    panY = cy - localY * zoom;

    updateCanvasTransform();
    updateZoomLabel();
}

function renderCanvas() {
    const project = appData.projects.find(p => p.id === appData.currentProjectId);
    if (!project) return;

    const container = document.getElementById('canvas-container');
    document.querySelectorAll('.scene-node').forEach(n => n.remove());

    project.scenes.forEach(scene => {
        const node = document.createElement('div');
        node.className = 'scene-node';
        node.id = `node-${scene.id}`;
        node.style.left = `${scene.x}px`;
        node.style.top = `${scene.y}px`;

        const completedTasks = scene.tasks ? scene.tasks.filter(t => t.done).length : 0;
        const totalTasks = scene.tasks ? scene.tasks.length : 0;
        const totalTimeSpent = calculateSceneTotalTime(scene);

        node.innerHTML = `
            <div class="node-header">
                <span>SCENE</span>
                <span class="node-delete" data-id="${scene.id}">REMOVE</span>
            </div>
            <div class="node-body">
                <div class="node-title">${escapeHtml(scene.title)}</div>
                <div class="node-info">TASKS: ${completedTasks}/${totalTasks}</div>
                <div class="node-info">TIME: ${formatTime(totalTimeSpent)}</div>
            </div>
            <div class="node-actions">
                <div class="drag-handle-btn" data-port="${scene.id}">LINK</div>
                <div class="field-label" style="cursor:pointer;" data-open="${scene.id}">OPEN</div>
            </div>
        `;

        setupNodeDrag(node, scene);
        setupPortDrag(node.querySelector('.drag-handle-btn'), scene.id);

        node.addEventListener('click', (e) => {
            if (e.target.classList.contains('node-delete')) {
                e.stopPropagation();
                deleteScene(scene.id);
            } else if (e.target.hasAttribute('data-open')) {
                e.stopPropagation();
                openSceneModal(scene.id);
            }
        });

        container.appendChild(node);
    });

    renderConnections();
}

function createScene() {
    const project = appData.projects.find(p => p.id === appData.currentProjectId);
    if (!project) return;

    const sceneCount = project.scenes.length + 1;
    const previousScene = project.scenes.length > 0 ? project.scenes[project.scenes.length - 1] : null;
    const newX = previousScene ? previousScene.x + 280 : 100;
    const newY = previousScene ? previousScene.y + 80 : 100;

    const newScene = {
        id: generateId(),
        title: `SCENE ${sceneCount}`,
        description: '',
        x: newX,
        y: newY,
        tasks: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    project.scenes.push(newScene);

    if (previousScene) {
        project.connections.push({
            id: generateId(),
            from: previousScene.id,
            to: newScene.id
        });
    }

    project.updatedAt = new Date().toISOString();
    saveData();
    renderCanvas();
}

function deleteScene(sceneId) {
    const project = appData.projects.find(p => p.id === appData.currentProjectId);
    if (!project) return;

    project.scenes = project.scenes.filter(s => s.id !== sceneId);
    project.connections = project.connections.filter(c => c.from !== sceneId && c.to !== sceneId);
    project.updatedAt = new Date().toISOString();
    saveData();
    renderCanvas();
}

function setupNodeDrag(nodeElement, sceneData) {
    let isDragging = false;
    let startNodeX = 0;
    let startNodeY = 0;
    let clientStartX = 0;
    let clientStartY = 0;

    function onPointerDown(e) {
        if (e.target.classList.contains('drag-handle-btn') || e.target.classList.contains('node-delete') || e.target.hasAttribute('data-open')) {
            return;
        }
        isDragging = true;
        const pointer = e.touches ? e.touches[0] : e;
        clientStartX = pointer.clientX;
        clientStartY = pointer.clientY;
        startNodeX = sceneData.x;
        startNodeY = sceneData.y;

        document.addEventListener('mousemove', onPointerMove);
        document.addEventListener('mouseup', onPointerUp);
        document.addEventListener('touchmove', onPointerMove, { passive: false });
        document.addEventListener('touchend', onPointerUp);
    }

    function onPointerMove(e) {
        if (!isDragging) return;
        if (e.cancelable) e.preventDefault();
        const pointer = e.touches ? e.touches[0] : e;
        // Divide pelo zoom para que o node acompanhe o cursor 1:1 na tela,
        // independente do nível de zoom atual.
        const dx = (pointer.clientX - clientStartX) / zoom;
        const dy = (pointer.clientY - clientStartY) / zoom;
        sceneData.x = startNodeX + dx;
        sceneData.y = startNodeY + dy;
        nodeElement.style.left = `${sceneData.x}px`;
        nodeElement.style.top = `${sceneData.y}px`;
        renderConnections();
    }

    function onPointerUp() {
        if (isDragging) {
            isDragging = false;
            const project = appData.projects.find(p => p.id === appData.currentProjectId);
            if (project) project.updatedAt = new Date().toISOString();
            saveData();
        }
        document.removeEventListener('mousemove', onPointerMove);
        document.removeEventListener('mouseup', onPointerUp);
        document.removeEventListener('touchmove', onPointerMove);
        document.removeEventListener('touchend', onPointerUp);
    }

    nodeElement.addEventListener('mousedown', onPointerDown);
    nodeElement.addEventListener('touchstart', onPointerDown, { passive: true });
}

function setupPortDrag(portBtn, sceneId) {
    function onPointerDown(e) {
        e.stopPropagation();
        draggingPortSourceId = sceneId;
        const pointer = e.touches ? e.touches[0] : e;
        tempMousePos = getCanvasLocalPos(pointer.clientX, pointer.clientY);

        document.addEventListener('mousemove', onPointerMove);
        document.addEventListener('mouseup', onPointerUp);
        document.addEventListener('touchmove', onPointerMove, { passive: false });
        document.addEventListener('touchend', onPointerUp);
    }

    function onPointerMove(e) {
        if (!draggingPortSourceId) return;
        if (e.cancelable) e.preventDefault();
        const pointer = e.touches ? e.touches[0] : e;
        tempMousePos = getCanvasLocalPos(pointer.clientX, pointer.clientY);
        renderConnections();
    }

    function onPointerUp(e) {
        if (!draggingPortSourceId) return;
        const pointer = e.changedTouches ? e.changedTouches[0] : e;
        const dropTarget = document.elementFromPoint(pointer.clientX, pointer.clientY);
        const targetNode = dropTarget ? dropTarget.closest('.scene-node') : null;

        if (targetNode) {
            const targetId = targetNode.id.replace('node-', '');
            if (targetId && targetId !== draggingPortSourceId) {
                const project = appData.projects.find(p => p.id === appData.currentProjectId);
                if (project) {
                    const exists = project.connections.some(
                        c => (c.from === draggingPortSourceId && c.to === targetId) ||
                             (c.from === targetId && c.to === draggingPortSourceId)
                    );
                    if (!exists) {
                        project.connections.push({
                            id: generateId(),
                            from: draggingPortSourceId,
                            to: targetId
                        });
                        project.updatedAt = new Date().toISOString();
                        saveData();
                    }
                }
            }
        }

        draggingPortSourceId = null;
        renderConnections();

        document.removeEventListener('mousemove', onPointerMove);
        document.removeEventListener('mouseup', onPointerUp);
        document.removeEventListener('touchmove', onPointerMove);
        document.removeEventListener('touchend', onPointerUp);
    }

    portBtn.addEventListener('mousedown', onPointerDown);
    portBtn.addEventListener('touchstart', onPointerDown, { passive: true });
}

function deleteConnection(connectionId) {
    const project = appData.projects.find(p => p.id === appData.currentProjectId);
    if (!project) return;
    project.connections = project.connections.filter(c => c.id !== connectionId);
    project.updatedAt = new Date().toISOString();
    saveData();
    renderConnections();
}

function getBestAnchorPoint(source, target) {
    const sCenterX = source.x + NODE_WIDTH / 2;
    const sCenterY = source.y + NODE_HEIGHT / 2;
    const tCenterX = target.x + NODE_WIDTH / 2;
    const tCenterY = target.y + NODE_HEIGHT / 2;

    const dx = tCenterX - sCenterX;
    const dy = tCenterY - sCenterY;

    let sX, sY, tX, tY;

    if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > 0) {
            sX = source.x + NODE_WIDTH; sY = sCenterY;
            tX = target.x; tY = tCenterY;
        } else {
            sX = source.x; sY = sCenterY;
            tX = target.x + NODE_WIDTH; tY = tCenterY;
        }
    } else {
        if (dy > 0) {
            sX = sCenterX; sY = source.y + NODE_HEIGHT;
            tX = tCenterX; tY = target.y;
        } else {
            sX = sCenterX; sY = source.y;
            tX = tCenterX; tY = target.y + NODE_HEIGHT;
        }
    }

    return { x1: sX, y1: sY, x2: tX, y2: tY };
}

function renderConnections() {
    const svg = document.getElementById('connections-layer');
    svg.innerHTML = '';
    const project = appData.projects.find(p => p.id === appData.currentProjectId);
    if (!project) return;

    project.connections.forEach(conn => {
        const sourceNode = project.scenes.find(s => s.id === conn.from);
        const targetNode = project.scenes.find(s => s.id === conn.to);

        if (sourceNode && targetNode) {
            const anchors = getBestAnchorPoint(sourceNode, targetNode);
            const dx = anchors.x2 - anchors.x1;
            const cx1 = anchors.x1 + dx / 2;
            const cy1 = anchors.y1;
            const cx2 = anchors.x1 + dx / 2;
            const cy2 = anchors.y2;

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const d = `M ${anchors.x1} ${anchors.y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${anchors.x2} ${anchors.y2}`;
            path.setAttribute('d', d);
            path.setAttribute('class', 'connection-line');
            path.setAttribute('data-id', conn.id);
            path.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteConnection(conn.id);
            });
            svg.appendChild(path);

            const circle1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle1.setAttribute('cx', anchors.x1);
            circle1.setAttribute('cy', anchors.y1);
            circle1.setAttribute('r', '5');
            circle1.setAttribute('fill', '#ffffff');
            circle1.setAttribute('stroke', '#000000');
            circle1.setAttribute('stroke-width', '1.5');

            const circle2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle2.setAttribute('cx', anchors.x2);
            circle2.setAttribute('cy', anchors.y2);
            circle2.setAttribute('r', '5');
            circle2.setAttribute('fill', '#ffffff');
            circle2.setAttribute('stroke', '#000000');
            circle2.setAttribute('stroke-width', '1.5');

            svg.appendChild(circle1);
            svg.appendChild(circle2);
        }
    });

    if (draggingPortSourceId) {
        const sourceNode = project.scenes.find(s => s.id === draggingPortSourceId);
        if (sourceNode) {
            const x1 = sourceNode.x + NODE_WIDTH / 2;
            const y1 = sourceNode.y + NODE_HEIGHT / 2;
            const x2 = tempMousePos.x;
            const y2 = tempMousePos.y;
            const dx = x2 - x1;
            const cx1 = x1 + dx / 2;
            const cy1 = y1;
            const cx2 = x1 + dx / 2;
            const cy2 = y2;

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const d = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
            path.setAttribute('d', d);
            path.setAttribute('class', 'temp-line');
            svg.appendChild(path);
        }
    }
}

function openSceneModal(sceneId) {
    appData.currentSceneId = sceneId;
    const project = appData.projects.find(p => p.id === appData.currentProjectId);
    const scene = project.scenes.find(s => s.id === sceneId);
    if (!scene) return;

    document.getElementById('scene-title-input').value = scene.title || '';
    document.getElementById('scene-desc-input').value = scene.description || '';
    document.getElementById('dates-display').textContent = `CREATED: ${formatDate(scene.createdAt)} | EDITED: ${formatDate(scene.updatedAt)}`;

    stopActiveTaskTimer();
    renderTasks(scene);
    document.getElementById('scene-modal').classList.add('active');
}

function renderTasks(scene) {
    const container = document.getElementById('tasks-container');
    container.innerHTML = '';

    if (!scene.tasks) scene.tasks = [];

    scene.tasks.forEach((task, index) => {
        if (task.timeSpent === undefined) task.timeSpent = 0;
        const item = document.createElement('div');
        item.className = `task-item ${task.done ? 'completed' : ''}`;

        const isRunning = (activeTaskIndex === index);

        item.innerHTML = `
            <div class="task-left">
                <span class="task-check" data-index="${index}">${task.done ? '[X]' : '[ ]'}</span>
                <span class="task-text">${escapeHtml(task.text)}</span>
            </div>
            <div class="task-right">
                <span class="task-timer-display" id="task-timer-${index}">${formatTime(task.timeSpent)}</span>
                <button class="task-timer-btn ${isRunning ? 'running' : ''}" data-timer="${index}">
                    ${isRunning ? 'PAUSE' : 'START'}
                </button>
                <span class="node-delete" data-delete="${index}">REMOVE</span>
            </div>`;

        item.addEventListener('click', (e) => {
            if (e.target.classList.contains('task-check')) {
                scene.tasks[index].done = !scene.tasks[index].done;
                scene.tasks[index].completedAt = scene.tasks[index].done ? new Date().toISOString() : null;
                saveData();
                renderTasks(scene);
            } else if (e.target.hasAttribute('data-delete')) {
                if (activeTaskIndex === index) {
                    stopActiveTaskTimer();
                }
                scene.tasks.splice(index, 1);
                saveData();
                renderTasks(scene);
            } else if (e.target.hasAttribute('data-timer')) {
                toggleTaskTimer(scene, index);
            }
        });

        container.appendChild(item);
    });
}

function toggleTaskTimer(scene, index) {
    if (activeTaskIndex === index) {
        stopActiveTaskTimer();
        renderTasks(scene);
    } else {
        stopActiveTaskTimer();
        activeTaskIndex = index;
        activeTimerInterval = setInterval(() => {
            scene.tasks[index].timeSpent = (scene.tasks[index].timeSpent || 0) + 1;

            const todayKey = formatDateKey(new Date());
            if (!appData.dailyTime) appData.dailyTime = {};
            appData.dailyTime[todayKey] = (appData.dailyTime[todayKey] || 0) + 1;

            const timerElem = document.getElementById(`task-timer-${index}`);
            if (timerElem) {
                timerElem.textContent = formatTime(scene.tasks[index].timeSpent);
            }
            saveData();
        }, 1000);
        renderTasks(scene);
    }
}

function stopActiveTaskTimer() {
    if (activeTimerInterval) {
        clearInterval(activeTimerInterval);
        activeTimerInterval = null;
    }
    activeTaskIndex = null;
}

function saveSceneChanges() {
    const project = appData.projects.find(p => p.id === appData.currentProjectId);
    if (!project) return;
    const scene = project.scenes.find(s => s.id === appData.currentSceneId);
    if (!scene) return;

    scene.title = document.getElementById('scene-title-input').value.trim() || 'UNTITLED SCENE';
    scene.description = document.getElementById('scene-desc-input').value;
    scene.updatedAt = new Date().toISOString();
    project.updatedAt = new Date().toISOString();

    stopActiveTaskTimer();
    saveData();
    document.getElementById('scene-modal').classList.remove('active');
    renderCanvas();
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

/* ================= METRICS BAR + CALENDAR ================= */

// Retorna o conjunto de dias (YYYY-MM-DD) do mes/ano informados em que
// pelo menos uma task foi concluida.
function getActiveTaskDaysInMonth(year, month) {
    const activeDays = new Set();
    getAllTasksFlat().forEach(t => {
        if (!t.done || !t.completedAt) return;
        const d = new Date(t.completedAt);
        if (d.getFullYear() === year && d.getMonth() === month) {
            activeDays.add(formatDateKey(d));
        }
    });
    return activeDays;
}

// Progresso mensal baseado em DIAS, nao em quantidade de tasks.
// Cada dia do mes em que pelo menos 1 task foi concluida = +1% (1 / total de dias do mes).
// So chega a 100% completando pelo menos 1 task em TODOS os dias do mes.
function calculateMonthlyDayProgress() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const activeDays = getActiveTaskDaysInMonth(year, month);
    const pct = daysInMonth > 0 ? Math.round((activeDays.size / daysInMonth) * 100) : 0;
    return { pct, activeDaysCount: activeDays.size, daysInMonth, year, month };
}

function renderMetricsBar() {
    const allTasks = getAllTasksFlat();
    const allScenes = getAllScenesFlat();
    const totalTasks = allTasks.length;
    const completedTasks = allTasks.filter(t => t.done).length;
    const totalTime = allTasks.reduce((sum, t) => sum + (t.timeSpent || 0), 0);

    const monthProgress = calculateMonthlyDayProgress();
    const pct = monthProgress.pct;

    const fill = document.getElementById('metrics-progress-fill');
    const label = document.getElementById('metrics-progress-label');
    const statsText = document.getElementById('metrics-stats-text');

    if (fill) fill.style.width = `${pct}%`;
    if (label) label.textContent = `${pct}%`;
    if (statsText) statsText.textContent = `// DAYS ACTIVE: ${monthProgress.activeDaysCount}/${monthProgress.daysInMonth} \u00B7 TASKS: ${completedTasks}/${totalTasks} \u00B7 SCENES: ${allScenes.length} \u00B7 TIME: ${formatTime(totalTime)}`;

    refreshOpenCalendar();
}

function refreshOpenCalendar() {
    const panel = document.getElementById('calendar-panel');
    if (!panel || !panel.classList.contains('open')) return;
    renderCalendar();
    if (selectedCalendarDay) {
        renderDayDetail(selectedCalendarDay);
    }
}

function dayHasActivity(dayKey) {
    if (appData.dailyTime && appData.dailyTime[dayKey]) return true;
    const scenesToday = getAllScenesFlat().some(s => s.createdAt && formatDateKey(new Date(s.createdAt)) === dayKey);
    if (scenesToday) return true;
    return getAllTasksFlat().some(t => t.completedAt && formatDateKey(new Date(t.completedAt)) === dayKey);
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const monthLabel = document.getElementById('calendar-month-label');
    if (!grid || !monthLabel) return;

    grid.innerHTML = '';
    const year = calendarViewDate.getFullYear();
    const month = calendarViewDate.getMonth();
    monthLabel.textContent = `${MONTH_LABELS[month]} ${year}`;

    WEEKDAY_LABELS.forEach(w => {
        const el = document.createElement('div');
        el.className = 'calendar-weekday';
        el.textContent = w;
        grid.appendChild(el);
    });

    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayKey = formatDateKey(new Date());

    for (let i = 0; i < startOffset; i++) {
        const empty = document.createElement('div');
        empty.className = 'calendar-day empty';
        grid.appendChild(empty);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateObj = new Date(year, month, day);
        const dayKey = formatDateKey(dateObj);
        const cell = document.createElement('div');
        cell.className = 'calendar-day';
        if (dayKey === todayKey) cell.classList.add('today');
        if (dayKey === selectedCalendarDay) cell.classList.add('selected');
        cell.innerHTML = `<span>${day}</span>`;

        if (dayHasActivity(dayKey)) {
            const dot = document.createElement('div');
            dot.className = 'day-dot';
            cell.appendChild(dot);
        }

        cell.addEventListener('click', () => {
            selectedCalendarDay = dayKey;
            renderCalendar();
            renderDayDetail(dayKey);
        });

        grid.appendChild(cell);
    }
}

function renderDayDetail(dayKey) {
    const detail = document.getElementById('calendar-detail');
    if (!detail) return;

    const timeSpent = (appData.dailyTime && appData.dailyTime[dayKey]) || 0;
    const tasksCompleted = getAllTasksFlat().filter(t => t.completedAt && formatDateKey(new Date(t.completedAt)) === dayKey).length;
    const scenesCreated = getAllScenesFlat().filter(s => s.createdAt && formatDateKey(new Date(s.createdAt)) === dayKey).length;
    const [y, m, d] = dayKey.split('-');

    detail.innerHTML = `
        <div class="calendar-detail-title">${d}/${m}/${y}</div>
        <div class="calendar-detail-row"><span>TIME SPENT</span><span>${formatTime(timeSpent)}</span></div>
        <div class="calendar-detail-row"><span>TASKS COMPLETED</span><span>${tasksCompleted}</span></div>
        <div class="calendar-detail-row"><span>SCENES CREATED</span><span>${scenesCreated}</span></div>
    `;
}

/* ================= YEAR OVERVIEW MODAL ================= */

function openYearModal() {
    yearModalViewYear = new Date().getFullYear();
    renderYearModal();
    document.getElementById('year-modal').classList.add('active');
}

function closeYearModal() {
    document.getElementById('year-modal').classList.remove('active');
}

function renderYearModal() {
    const label = document.getElementById('year-nav-label');
    if (label) label.textContent = yearModalViewYear;
    renderYearHeatmap(yearModalViewYear);
    renderYearBarChart(yearModalViewYear);
}

function renderYearHeatmap(year) {
    const grid = document.getElementById('year-heatmap-grid');
    const legend = document.getElementById('year-heatmap-legend');
    if (!grid) return;
    grid.innerHTML = '';

    // Grade retangular simples (dia 1 até o último dia do ano, em ordem),
    // que se ajusta sozinha à largura do modal, sem precisar de scroll.
    const daysInYear = (new Date(year, 1, 29).getMonth() === 1) ? 366 : 365;
    const now = new Date();
    const todayKey = formatDateKey(now);
    let activeCount = 0;

    for (let dayIndex = 0; dayIndex < daysInYear; dayIndex++) {
        const dateObj = new Date(year, 0, dayIndex + 1);
        const dayKey = formatDateKey(dateObj);
        const dot = document.createElement('div');
        dot.className = 'year-dot';

        const isFuture = dateObj > now;
        if (!isFuture && dayHasActivity(dayKey)) {
            dot.classList.add('active');
            activeCount++;
        }
        if (dayKey === todayKey) {
            dot.classList.add('today');
        }
        dot.title = dayKey;

        grid.appendChild(dot);
    }

    if (legend) {
        legend.textContent = `// ${activeCount} DAY${activeCount === 1 ? '' : 'S'} ACTIVE IN ${year}`;
    }
}

function renderYearBarChart(year) {
    const container = document.getElementById('year-bar-chart');
    if (!container) return;
    container.innerHTML = '';

    const monthTotals = new Array(12).fill(0);
    const dailyTime = appData.dailyTime || {};
    Object.keys(dailyTime).forEach(key => {
        const parts = key.split('-');
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (y === year) {
            monthTotals[m - 1] += dailyTime[key] || 0;
        }
    });

    const maxVal = Math.max(...monthTotals, 1);
    const now = new Date();
    const isCurrentYear = year === now.getFullYear();

    monthTotals.forEach((secs, idx) => {
        const col = document.createElement('div');
        col.className = 'year-bar-col';
        if (isCurrentYear && idx === now.getMonth()) {
            col.classList.add('is-current-month');
        }

        const heightPct = secs > 0 ? Math.max((secs / maxVal) * 100, 4) : 0;
        const valueLabel = secs > 0 ? formatTime(secs) : '--';

        col.innerHTML = `
            <span class="year-bar-value">${valueLabel}</span>
            <div class="year-bar-track">
                <div class="year-bar" style="height:${heightPct}%;"></div>
            </div>
            <span class="year-bar-label">${MONTH_SHORT_LABELS[idx]}</span>
        `;
        container.appendChild(col);
    });
}

function setupEventListeners() {
    document.getElementById('back-btn').addEventListener('click', () => {
        switchView('projects');
    });

    // --- YEAR OVERVIEW MODAL ---
    document.getElementById('header-title').addEventListener('click', () => {
        openYearModal();
    });

    document.getElementById('close-year-modal').addEventListener('click', () => {
        closeYearModal();
    });

    document.getElementById('year-prev-btn').addEventListener('click', () => {
        yearModalViewYear--;
        renderYearModal();
    });

    document.getElementById('year-next-btn').addEventListener('click', () => {
        yearModalViewYear++;
        renderYearModal();
    });

    document.getElementById('main-action-btn').addEventListener('click', () => {
        if (appData.currentProjectId === null) {
            openProjectModalForCreate();
        } else {
            createScene();
        }
    });

    document.getElementById('color-picker').addEventListener('click', (e) => {
        const card = e.target.closest('.color-card-option');
        if (card) {
            selectColorOption(card.getAttribute('data-color'));
        }
    });

    document.getElementById('close-project-modal').addEventListener('click', () => {
        document.getElementById('project-modal').classList.remove('active');
    });

    document.getElementById('save-project-btn').addEventListener('click', saveProject);

    document.getElementById('close-scene-modal').addEventListener('click', () => {
        stopActiveTaskTimer();
        document.getElementById('scene-modal').classList.remove('active');
    });

    document.getElementById('save-scene-btn').addEventListener('click', saveSceneChanges);

    document.getElementById('add-task-btn').addEventListener('click', () => {
        const input = document.getElementById('task-input');
        const text = input.value.trim();
        if (text && appData.currentProjectId && appData.currentSceneId) {
            const project = appData.projects.find(p => p.id === appData.currentProjectId);
            const scene = project.scenes.find(s => s.id === appData.currentSceneId);
            if (scene) {
                if (!scene.tasks) scene.tasks = [];
                scene.tasks.push({ text: text, done: false, timeSpent: 0, completedAt: null });
                saveData();
                input.value = '';
                renderTasks(scene);
            }
        }
    });

    const canvasView = document.getElementById('canvas-view');

    function startPanning(e) {
        if (e.target.id === 'canvas-view' || e.target.id === 'canvas-container' || e.target.id === 'connections-layer') {
            isPanning = true;
            const pointer = e.touches ? e.touches[0] : e;
            startX = pointer.clientX - panX;
            startY = pointer.clientY - panY;
        }
    }

    function doPanning(e) {
        if (!isPanning) return;
        const pointer = e.touches ? e.touches[0] : e;
        panX = pointer.clientX - startX;
        panY = pointer.clientY - startY;
        updateCanvasTransform();
    }

    function stopPanning() {
        isPanning = false;
    }

    canvasView.addEventListener('mousedown', startPanning);
    window.addEventListener('mousemove', doPanning);
    window.addEventListener('mouseup', stopPanning);

    canvasView.addEventListener('touchstart', startPanning, { passive: true });
    window.addEventListener('touchmove', doPanning, { passive: true });
    window.addEventListener('touchend', stopPanning);

    // --- ZOOM: RODINHA DO MOUSE ---
    canvasView.addEventListener('wheel', (e) => {
        e.preventDefault();
        const direction = e.deltaY < 0 ? 1 : -1;
        const newZoom = zoom * (1 + direction * 0.12);
        setZoom(newZoom, e.clientX, e.clientY);
    }, { passive: false });

    // --- ZOOM: BOTOES NA TELA ---
    document.getElementById('zoom-in-btn').addEventListener('click', () => {
        setZoom(zoom + ZOOM_STEP);
    });
    document.getElementById('zoom-out-btn').addEventListener('click', () => {
        setZoom(zoom - ZOOM_STEP);
    });
    document.getElementById('zoom-reset-btn').addEventListener('click', () => {
        resetCanvasPan();
    });

    // --- METRICS BAR / CALENDAR ---
    document.getElementById('metrics-bar-toggle').addEventListener('click', () => {
        const panel = document.getElementById('calendar-panel');
        const arrow = document.getElementById('metrics-toggle-arrow');
        const isOpen = panel.classList.toggle('open');
        arrow.innerHTML = isOpen ? '&#9660; CLOSE' : '&#9650; CALENDAR';
        if (isOpen) {
            calendarViewDate = new Date();
            if (!selectedCalendarDay) selectedCalendarDay = formatDateKey(new Date());
            renderCalendar();
            renderDayDetail(selectedCalendarDay);
        }
    });

    document.getElementById('calendar-prev-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        calendarViewDate.setMonth(calendarViewDate.getMonth() - 1);
        renderCalendar();
    });

    document.getElementById('calendar-next-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        calendarViewDate.setMonth(calendarViewDate.getMonth() + 1);
        renderCalendar();
    });
}
