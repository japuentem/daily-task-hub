/**
 * TaskMaster Pro - Core Logic
 * Author: Antigravity AI
 */

class TaskMaster {
    constructor() {
        this.tasks = JSON.parse(localStorage.getItem('tm_tasks')) || [];
        this.timers = {};
        this.currentFilter = 'all';
        this.editingTaskId = null;
        this.currentView = 'tasks';
        this.theme = localStorage.getItem('tm_theme') || 'dark'; // Preference
        this.pomodoro = {
            timer: null,
            timeLeft: 1500, // 25 minutes
            isActive: false,
            mode: 'work' // 'work' or 'break'
        };
        this.notes = JSON.parse(localStorage.getItem('tm_notes')) || [];
        this.selectedNoteColor = 'yellow';
        this.editingNoteId = null; // Track editing state for notes
        this.charts = {};

        this.init();
    }

    init() {
        this.cacheDOM();
        this.applyTheme();
        this.bindEvents();
        this.checkRecurringTasks();
        this.render();
        this.renderNotes();
        this.startBackgroundProcesses();
    }

    cacheDOM() {
        this.taskForm = document.getElementById('taskForm');
        this.taskTitle = document.getElementById('taskTitle');
        this.taskStart = document.getElementById('taskStart');
        this.taskEnd = document.getElementById('taskEnd');
        this.taskRecurring = document.getElementById('taskRecurring');
        this.taskList = document.getElementById('taskList');
        this.btnExport = document.getElementById('btnExport');
        this.btnSummary = document.getElementById('btnSummary');
        this.modalSummary = document.getElementById('modalSummary');
        this.summaryText = document.getElementById('summaryText');
        this.btnCopySummary = document.getElementById('btnCopySummary');
        this.closeModalBtns = document.querySelectorAll('.close-modal');
        this.filterBtns = document.querySelectorAll('.filter-btn');
        this.btnSubmitTask = document.getElementById('btnSubmitTask');
        this.btnCancelEdit = document.getElementById('btnCancelEdit');

        // New Elements
        this.taskCategory = document.getElementById('taskCategory');
        this.taskPriority = document.getElementById('taskPriority');
        this.navBtns = document.querySelectorAll('.nav-btn');
        this.viewTasks = document.getElementById('viewTasks');
        this.viewDashboard = document.getElementById('viewDashboard');
        this.viewNotes = document.getElementById('viewNotes');
        
        // Pomodoro
        this.btnPomodoro = document.getElementById('btnPomodoro');
        this.modalPomodoro = document.getElementById('modalPomodoro');
        this.pomodoroDisplay = document.getElementById('pomodoroDisplay');
        this.pomodoroMode = document.getElementById('pomodoroMode');
        this.btnPomodoroStart = document.getElementById('btnPomodoroStart');
        this.btnPomodoroReset = document.getElementById('btnPomodoroReset');

        // Notes
        this.btnNewNote = document.getElementById('btnNewNote');
        this.modalNote = document.getElementById('modalNote');
        this.noteForm = document.getElementById('noteForm');
        this.noteText = document.getElementById('noteText');
        this.notesGrid = document.getElementById('notesGrid');
        this.colorBtns = document.querySelectorAll('.color-btn');
        this.btnThemeToggle = document.getElementById('btnThemeToggle');
        this.btnCancelNoteEdit = document.getElementById('btnCancelNoteEdit');
        this.btnSaveNote = document.getElementById('btnSaveNote');

        // Data Management
        this.btnImportJson = document.getElementById('btnImportJson');
        this.btnExportJson = document.getElementById('btnExportJson');
        this.inputFileJson = document.getElementById('inputFileJson');
    }

    bindEvents() {
        this.taskForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveTask();
        });

        this.btnExport.addEventListener('click', () => this.exportToExcel());
        this.btnSummary.addEventListener('click', () => this.showSummary());
        this.btnCopySummary.addEventListener('click', () => this.copySummary());
        this.btnCancelEdit.addEventListener('click', () => this.cancelEdit());
        this.taskRecurring.addEventListener('change', () => this.handleRecurringToggle());

        // Modal Close Logic (Shared)
        this.closeModalBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                if (modal) modal.style.display = 'none';
            });
        });

        window.onclick = (e) => { 
            if (e.target.classList.contains('modal')) {
                e.target.style.display = 'none';
            }
        };

        this.filterBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentFilter = btn.dataset.filter;
                this.render();
            });
        });

        // Navigation
        this.navBtns.forEach(btn => {
            btn.addEventListener('click', () => this.switchView(btn.dataset.view));
        });

        // Pomodoro
        this.btnPomodoro.addEventListener('click', () => this.modalPomodoro.style.display = 'block');
        this.btnPomodoroStart.addEventListener('click', () => this.togglePomodoro());
        this.btnPomodoroReset.addEventListener('click', () => this.resetPomodoro());

        // Notes
        this.btnSaveNote = document.getElementById('btnSaveNote');
        this.btnSaveNote.addEventListener('click', () => this.addNote());
        this.btnCancelNoteEdit.addEventListener('click', () => this.cancelNoteEdit());

        this.colorBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.colorBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedNoteColor = btn.dataset.color;
            });
        });

        // Theme
        this.btnThemeToggle.addEventListener('click', () => this.toggleTheme());

        // Data 
        this.btnExportJson.addEventListener('click', () => this.exportToJson());
        this.btnImportJson.addEventListener('click', () => this.inputFileJson.click());
        this.inputFileJson.addEventListener('change', (e) => this.importFromJson(e));

        // Request Notifications
        if (Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }

    startBackgroundProcesses() {
        // Update active timers every second
        setInterval(() => this.updateUIGlobalTimers(), 1000);

        // Check for notifications every minute
        setInterval(() => this.checkSchedule(), 60000);
    }

    save() {
        localStorage.setItem('tm_tasks', JSON.stringify(this.tasks));
    }

    saveTask() {
        if (this.editingTaskId) {
            this.updateTask();
            return;
        }

        const newTask = {
            id: Date.now(),
            title: this.taskTitle.value,
            start: this.taskStart.value,
            end: this.taskEnd.value,
            category: this.taskCategory.value,
            priority: this.taskPriority.value,
            recurring: this.taskRecurring.checked,
            completed: false,
            duration: 0, // in seconds
            timerActive: false,
            timerStartedAt: null,
            createdAt: new Date().toISOString()
        };

        this.tasks.push(newTask);
        this.save();
        this.render();
        this.taskForm.reset();
        this.showToast('Tarea añadida con éxito');
    }

    editTask(id) {
        const task = this.tasks.find(t => t.id === id);
        if (!task) return;

        this.editingTaskId = id;
        this.taskTitle.value = task.title;
        this.taskStart.value = task.start || '';
        this.taskEnd.value = task.end || '';
        this.taskCategory.value = task.category || 'Generales';
        this.taskPriority.value = task.priority || 'Media';
        this.taskRecurring.checked = task.recurring;
        this.handleRecurringToggle();

        this.btnSubmitTask.textContent = 'Guardar Cambios';
        this.btnCancelEdit.style.display = 'block';
        this.taskTitle.focus();
        
        // Scroll to form
        this.taskForm.scrollIntoView({ behavior: 'smooth' });
    }

    updateTask() {
        const task = this.tasks.find(t => t.id === this.editingTaskId);
        if (task) {
            task.title = this.taskTitle.value;
            task.start = this.taskStart.value;
            task.end = this.taskEnd.value;
            task.category = this.taskCategory.value;
            task.priority = this.taskPriority.value;
            task.recurring = this.taskRecurring.checked;

            this.save();
            this.render();
            this.cancelEdit();
            this.showToast('Tarea actualizada correctmente');
        }
    }

    cancelEdit() {
        this.editingTaskId = null;
        this.taskForm.reset();
        this.btnSubmitTask.textContent = 'Añadir Tarea';
        this.btnCancelEdit.style.display = 'none';
        this.handleRecurringToggle(); // Reset labels
    }

    handleRecurringToggle() {
        const labels = this.taskForm.querySelectorAll('.input-group label');
        labels.forEach(label => {
            if (label.getAttribute('for') === 'taskStart' || label.getAttribute('for') === 'taskEnd') {
                if (this.taskRecurring.checked) {
                    if (!label.innerHTML.includes('(Opcional)')) {
                        label.innerHTML += ' <span style="font-size:0.7rem; opacity:0.7;">(Opcional)</span>';
                    }
                } else {
                    label.innerHTML = label.innerHTML.replace(' <span style="font-size:0.7rem; opacity:0.7;">(Opcional)</span>', '');
                }
            }
        });
    }

    deleteTask(id) {
        this.tasks = this.tasks.filter(t => t.id !== id);
        this.save();
        this.render();
    }

    switchView(view) {
        this.currentView = view;
        this.navBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });

        // Hide all
        this.viewTasks.style.display = 'none';
        this.viewDashboard.style.display = 'none';
        this.viewNotes.style.display = 'none';

        if (view === 'tasks') {
            this.viewTasks.style.display = 'block';
        } else if (view === 'dashboard') {
            this.viewDashboard.style.display = 'block';
            this.updateCharts();
        } else {
            this.viewNotes.style.display = 'block';
            this.renderNotes();
        }
    }

    toggleTheme() {
        this.theme = this.theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('tm_theme', this.theme);
        this.applyTheme();
        
        // Refresh charts if in dashboard
        if (this.currentView === 'dashboard') {
            this.updateCharts();
        }
    }

    applyTheme() {
        if (this.theme === 'light') {
            document.body.classList.add('light-mode');
            if (this.btnThemeToggle) this.btnThemeToggle.textContent = '☀️';
        } else {
            document.body.classList.remove('light-mode');
            if (this.btnThemeToggle) this.btnThemeToggle.textContent = '🌙';
        }
    }

    // Pomodoro Logic
    togglePomodoro() {
        if (this.pomodoro.isActive) {
            clearInterval(this.pomodoro.timer);
            this.pomodoro.isActive = false;
            this.btnPomodoroStart.textContent = 'Reanudar';
        } else {
            this.pomodoro.isActive = true;
            this.btnPomodoroStart.textContent = 'Pausar';
            this.pomodoro.timer = setInterval(() => {
                this.pomodoro.timeLeft--;
                this.updatePomodoroUI();
                if (this.pomodoro.timeLeft <= 0) {
                    this.handlePomodoroEnd();
                }
            }, 1000);
        }
    }

    resetPomodoro() {
        clearInterval(this.pomodoro.timer);
        this.pomodoro.isActive = false;
        this.pomodoro.mode = 'work';
        this.pomodoro.timeLeft = 1500;
        this.btnPomodoroStart.textContent = 'Iniciar';
        this.updatePomodoroUI();
    }

    updatePomodoroUI() {
        const mins = Math.floor(this.pomodoro.timeLeft / 60);
        const secs = this.pomodoro.timeLeft % 60;
        this.pomodoroDisplay.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        this.pomodoroMode.textContent = this.pomodoro.mode === 'work' ? 'Sesión de Trabajo' : 'Descanso';
    }

    handlePomodoroEnd() {
        clearInterval(this.pomodoro.timer);
        this.pomodoro.isActive = false;
        
        const message = this.pomodoro.mode === 'work' ? '¡Tiempo de descanso!' : '¡A trabajar!';
        this.showToast(message, true);
        this.notify(message);

        if (this.pomodoro.mode === 'work') {
            this.pomodoro.mode = 'break';
            this.pomodoro.timeLeft = 300; // 5 mins
        } else {
            this.pomodoro.mode = 'work';
            this.pomodoro.timeLeft = 1500; // 25 mins
        }
        
        this.updatePomodoroUI();
        this.btnPomodoroStart.textContent = 'Iniciar';
    }

    notify(message) {
        if (Notification.permission === 'granted') {
            new Notification('TaskMaster Pro', { body: message, icon: '⚡' });
        }
    }

    toggleTask(id) {
        const task = this.tasks.find(t => t.id === id);
        if (task) {
            task.completed = !task.completed;
            
            // Si se marca como completada y no tiene fecha de fin, asignamos la actual
            if (task.completed) {
                if (!task.end) {
                    const now = new Date();
                    // Formato requerido por datetime-local: YYYY-MM-DDThh:mm
                    const tzOffset = now.getTimezoneOffset() * 60000;
                    task.end = new Date(now - tzOffset).toISOString().slice(0, 16);
                }
                if (task.timerActive) this.toggleTimer(id);
            }
            
            this.save();
            this.render();
        }
    }

    toggleTimer(id) {
        const task = this.tasks.find(t => t.id === id);
        if (!task) return;

        if (task.timerActive) {
            // Stop timer
            const elapsed = Math.floor((Date.now() - new Date(task.timerStartedAt).getTime()) / 1000);
            task.duration += elapsed;
            task.timerActive = false;
            task.timerStartedAt = null;
        } else {
            // Start timer
            task.timerActive = true;
            task.timerStartedAt = new Date().toISOString();
            
            // Registro automático de inicio si no existe
            if (!task.start) {
                const now = new Date();
                const tzOffset = now.getTimezoneOffset() * 60000;
                task.start = new Date(now - tzOffset).toISOString().slice(0, 16);
            }
        }

        this.save();
        this.render();
    }

    checkRecurringTasks() {
        const todayStr = new Date().toLocaleDateString();
        const recurringTemplates = this.tasks.filter(t => t.recurring);

        recurringTemplates.forEach(template => {
            // Check if there is an instance for today
            const alreadyExists = this.tasks.some(t =>
                t.title === template.title &&
                new Date(t.createdAt).toLocaleDateString() === todayStr &&
                t.id !== template.id
            );

            if (!alreadyExists && new Date(template.createdAt).toLocaleDateString() !== todayStr) {
                // Auto-create today's version
                const instance = { ...template, id: Date.now() + Math.random(), createdAt: new Date().toISOString(), completed: false, duration: 0, timerActive: false };
                this.tasks.push(instance);
            }
        });
        this.save();
    }

    formatDuration(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    updateUIGlobalTimers() {
        const activeTimerElements = document.querySelectorAll('[data-active-timer]');
        activeTimerElements.forEach(el => {
            const startTime = new Date(el.dataset.startTime).getTime();
            const baseDuration = parseInt(el.dataset.baseDuration);
            const currentSession = Math.floor((Date.now() - startTime) / 1000);
            el.textContent = this.formatDuration(baseDuration + currentSession);
        });
    }

    render() {
        let filteredTasks = this.tasks;
        if (this.currentFilter === 'pending') filteredTasks = this.tasks.filter(t => !t.completed);
        if (this.currentFilter === 'completed') filteredTasks = this.tasks.filter(t => t.completed);

        if (filteredTasks.length === 0) {
            this.taskList.innerHTML = `<div class="empty-state"><p>No hay actividades para mostrar.</p></div>`;
            return;
        }

        this.taskList.innerHTML = filteredTasks.map(task => {
            const displayDuration = task.timerActive ? '...' : this.formatDuration(task.duration);
            const startTimeFormatted = task.start ? new Date(task.start).toLocaleString([], {day: '2-digit', month: '2-digit', hour: '2-digit', minute:'2-digit'}) : 'Sin inicio';
            const endTimeFormatted = task.end ? new Date(task.end).toLocaleString([], {day: '2-digit', month: '2-digit', hour: '2-digit', minute:'2-digit'}) : 'S/ fecha fin';
            
            const isOverdue = !task.completed && task.end && new Date(task.end) < new Date();
            const priorityClass = `priority-${(task.priority || 'media').toLowerCase()}`;

            return `
                <div class="task-item ${task.completed ? 'completed' : ''} ${isOverdue ? 'overdue' : ''} ${task.recurring ? 'recurring-task' : ''} ${priorityClass}" id="task-${task.id}">
                    <div class="task-header-row">
                        <span class="category-badge">${task.category || 'Gral'}</span>
                        <div class="task-check ${task.completed ? 'checked' : ''}" onclick="app.toggleTask(${task.id})" title="Marcar como hecha"></div>
                    </div>
                    
                    <div class="task-info">
                        <h3>${task.title} ${task.recurring ? '<span style="font-size:0.75rem;" title="Recurrente">🔄</span>' : ''}</h3>
                        
                        <div class="task-meta">
                            <div class="meta-item" title="Fecha de inicio">
                                <span>📅</span>
                                <span>${startTimeFormatted}</span>
                            </div>
                            <div class="meta-item" title="Fecha de fin">
                                <span>🏁</span>
                                <span>${endTimeFormatted}</span>
                            </div>
                        </div>
                        
                        <div class="timer-pill" ${task.timerActive ? `data-active-timer data-start-time="${task.timerStartedAt}" data-base-duration="${task.duration}"` : ''}>
                            ${task.timerActive ? 'Corriendo...' : displayDuration}
                        </div>
                    </div>
                    
                    <div class="task-actions">
                        <button class="btn-icon btn-play" onclick="app.toggleTimer(${task.id})" title="${task.timerActive ? 'Pausar' : 'Iniciar Timer'}">
                            ${task.timerActive ? '⏸️' : '▶️'}
                        </button>
                        <button class="btn-icon btn-edit" onclick="app.editTask(${task.id})" title="Editar">✏️</button>
                        <button class="btn-icon" onclick="app.deleteTask(${task.id})" title="Eliminar">🗑️</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    showSummary() {
        const todayTasks = this.tasks.filter(t => new Date(t.createdAt).toLocaleDateString() === new Date().toLocaleDateString());
        let report = `RESUMEN DE ACTIVIDADES - ${new Date().toLocaleDateString()}\n`;
        report += `==========================================\n\n`;

        if (todayTasks.length === 0) {
            report += "No se registraron actividades hoy.";
        } else {
            todayTasks.forEach(t => {
                let status = t.completed ? "[HECHO]" : "[PENDIENTE]";
                if (t.recurring && !t.completed) status = "[RECURRENTE]";
                
                const timeStr = t.duration > 0 ? ` (Invertido: ${this.formatDuration(t.duration)})` : '';
                const endStr = (t.completed && t.end) ? ` - Finalizado a las ${new Date(t.end).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : '';
                report += `${status} ${t.title}${timeStr}${endStr}\n`;
            });
        }

        report += `\nGenerado con TaskMaster Pro.`;
        this.summaryText.value = report;
        this.modalSummary.style.display = 'block';
    }

    copySummary() {
        this.summaryText.select();
        document.execCommand('copy');
        this.showToast('¡Resumen copiado al portapapeles!');
    }

    exportToExcel() {
        // Data for Activities
        const taskData = this.tasks.map(t => ({
            "Actividad": t.title,
            "Inicio": t.start || "Sin fecha de inicio",
            "Fin": t.end || "Sin fecha fin",
            "Categoría": t.category || "Generales",
            "Prioridad": t.priority || "Media",
            "Recurrente": t.recurring ? "Sí" : "No",
            "Estado": t.completed ? "Completado" : "Pendiente",
            "Tiempo Invertido": this.formatDuration(t.duration),
            "Fecha Creación": new Date(t.createdAt).toLocaleDateString()
        }));

        // Data for Notes
        const noteData = this.notes.map(n => ({
            "Fecha": n.date,
            "Color": n.color || "yellow",
            "Contenido": n.text
        }));

        const workbook = XLSX.utils.book_new();
        
        // Add Activities sheet
        const taskSheet = XLSX.utils.json_to_sheet(taskData);
        XLSX.utils.book_append_sheet(workbook, taskSheet, "Actividades");
        
        // Add Notes sheet
        if (noteData.length > 0) {
            const noteSheet = XLSX.utils.json_to_sheet(noteData);
            XLSX.utils.book_append_sheet(workbook, noteSheet, "Notas");
        }

        XLSX.writeFile(workbook, `TaskMaster_Full_Report_${Date.now()}.xlsx`);
        this.showToast('Excel generado correctamente');
    }

    // New: Charts Logic
    updateCharts() {
        this.renderCategoryChart();
        this.renderProductivityChart();
    }

    renderCategoryChart() {
        const ctx = document.getElementById('categoryChart').getContext('2d');
        const categories = {};
        this.tasks.forEach(t => {
            const cat = t.category || 'Generales';
            categories[cat] = (categories[cat] || 0) + (t.duration / 3600); // in hours
        });

        if (this.charts.category) this.charts.category.destroy();

        const totalHours = Object.values(categories).reduce((a, b) => a + b, 0);
        if (totalHours === 0) {
            ctx.font = '14px Arial';
            ctx.fillStyle = '#94a3b8';
            ctx.textAlign = 'center';
            ctx.fillText('Sin datos de tiempo aún', ctx.canvas.width/2, ctx.canvas.height/2);
            return;
        }

        this.charts.category = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(categories),
                datasets: [{
                    data: Object.values(categories),
                    backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#a855f7'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: this.theme === 'light' ? '#64748b' : '#94a3b8' } }
                }
            }
        });
    }

    renderProductivityChart() {
        const ctx = document.getElementById('productivityChart').getContext('2d');
        const days = {};
        const last7Days = [...Array(7)].map((_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - i);
            return d.toLocaleDateString();
        }).reverse();

        last7Days.forEach(day => days[day] = 0);

        this.tasks.forEach(t => {
            const day = new Date(t.createdAt).toLocaleDateString();
            if (days.hasOwnProperty(day)) {
                days[day] += (t.duration / 3600);
            }
        });

        if (this.charts.productivity) this.charts.productivity.destroy();

        const totalHours = Object.values(days).reduce((a, b) => a + b, 0);
        const labelColor = this.theme === 'light' ? '#64748b' : '#94a3b8';
        const gridColor = this.theme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';

        if (totalHours === 0) {
            ctx.font = '14px Arial';
            ctx.fillStyle = labelColor;
            ctx.textAlign = 'center';
            ctx.fillText('Sin actividad en los últimos 7 días', ctx.canvas.width/2, ctx.canvas.height/2);
            return;
        }

        this.charts.productivity = new Chart(ctx, {
            type: 'line',
            data: {
                labels: Object.keys(days).map(d => d.split('/')[0] + '/' + d.split('/')[1]),
                datasets: [{
                    label: 'Horas',
                    data: Object.values(days),
                    borderColor: '#6366f1',
                    tension: 0.4,
                    fill: true,
                    backgroundColor: 'rgba(99, 102, 241, 0.1)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { 
                        beginAtZero: true, 
                        grid: { color: gridColor }, 
                        ticks: { color: labelColor } 
                    },
                    x: { 
                        grid: { display: false }, 
                        ticks: { color: labelColor } 
                    }
                },
                plugins: { legend: { display: false } }
            }
        });
    }

    // New: Data Management
    exportToJson() {
        const data = {
            tasks: this.tasks,
            notes: this.notes,
            exportedAt: new Date().toISOString()
        };
        const dataStr = JSON.stringify(data, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        const exportFileDefaultName = `taskmaster_full_backup_${new Date().toISOString().slice(0,10)}.json`;

        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
        this.showToast('Backup completo descargado');
    }

    importFromJson(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                // Handle legacy format (just tasks array) or new format (with notes)
                if (Array.isArray(importedData)) {
                    this.tasks = importedData;
                } else if (importedData.tasks && importedData.notes) {
                    this.tasks = importedData.tasks;
                    this.notes = importedData.notes;
                    this.saveNotes();
                }
                
                this.save();
                this.render();
                this.renderNotes();
                this.showToast('Datos importados con éxito');
            } catch (err) {
                this.showToast('Error al importar el archivo', true);
            }
        };
        reader.readAsText(file);
    }

    // NEW: Notes Implementation
    addNote() {
        if (!this.noteText.value.trim()) {
            this.showToast('La nota no puede estar vacía', true);
            return;
        }

        if (this.editingNoteId) {
            this.updateNote();
            return;
        }

        const newNote = {
            id: Date.now(),
            text: this.noteText.value,
            color: this.selectedNoteColor,
            date: new Date().toLocaleDateString()
        };

        this.notes.unshift(newNote); // Add to beginning
        this.saveNotes();
        this.renderNotes();
        this.noteText.value = ''; // Clean inline input
        this.showToast('Nota guardada');
    }

    editNote(id) {
        const note = this.notes.find(n => n.id === id);
        if (!note) return;

        this.editingNoteId = id;
        this.noteText.value = note.text;
        this.selectedNoteColor = note.color || 'yellow';
        
        // Update color picker UI
        this.colorBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.color === this.selectedNoteColor);
        });

        this.btnSaveNote.textContent = 'Guardar Cambios';
        this.btnCancelNoteEdit.style.display = 'block';
        this.noteText.focus();
    }

    updateNote() {
        const note = this.notes.find(n => n.id === this.editingNoteId);
        if (note) {
            note.text = this.noteText.value;
            note.color = this.selectedNoteColor;
            note.date = new Date().toLocaleDateString() + " (editado)";

            this.saveNotes();
            this.renderNotes();
            this.cancelNoteEdit();
            this.showToast('Nota actualizada');
        }
    }

    cancelNoteEdit() {
        this.editingNoteId = null;
        this.noteText.value = '';
        this.btnSaveNote.textContent = 'Guardar Nota';
        this.btnCancelNoteEdit.style.display = 'none';
        
        // Reset to default color
        this.selectedNoteColor = 'yellow';
        this.colorBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.color === 'yellow');
        });
    }

    deleteNote(id) {
        if (this.editingNoteId === id) this.cancelNoteEdit();
        this.notes = this.notes.filter(n => n.id !== id);
        this.saveNotes();
        this.renderNotes();
    }

    saveNotes() {
        localStorage.setItem('tm_notes', JSON.stringify(this.notes));
    }

    renderNotes() {
        if (this.notes.length === 0) {
            this.notesGrid.innerHTML = `<div class="empty-state" style="grid-column: 1/-1;"><p>No hay notas guardadas aún.</p></div>`;
            return;
        }

        this.notesGrid.innerHTML = this.notes.map(note => `
            <div class="note-card note-${note.color || 'yellow'}">
                <div class="note-content" onclick="app.editNote(${note.id})" title="Haga clic para editar">
                    ${note.text.replace(/\n/g, '<br>')}
                </div>
                <div class="note-footer">
                    <span>${note.date}</span>
                    <div class="note-actions">
                        <button class="btn-edit-note" onclick="app.editNote(${note.id})" title="Editar nota">✏️</button>
                        <button class="btn-delete-note" onclick="app.deleteNote(${note.id})" title="Eliminar nota">🗑️</button>
                    </div>
                </div>
            </div>
        `).join('');
    }

    checkSchedule() {
        const now = new Date();
        this.tasks.forEach(task => {
            if (!task.completed && task.start) {
                const startTime = new Date(task.start);
                const diffMinutes = (startTime - now) / 1000 / 60;

                if (diffMinutes > 0 && diffMinutes <= 5) {
                    this.showToast(`¡Tarea próxima!: ${task.title}`, true);
                }
            }
        });
    }

    showToast(message, withSound = false) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        this.toastContainer.appendChild(toast);

        if (withSound) this.playNotificationSound();

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    playNotificationSound() {
        try {
            const context = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = context.createOscillator();
            const gain = context.createGain();

            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(440, context.currentTime); // A4
            oscillator.frequency.exponentialRampToValueAtTime(880, context.currentTime + 0.1);

            gain.gain.setValueAtTime(0.1, context.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.5);

            oscillator.connect(gain);
            gain.connect(context.destination);

            oscillator.start();
            oscillator.stop(context.currentTime + 0.5);
        } catch (e) {
            console.error("Audio error:", e);
        }
    }
}

// Global instance for inline event handlers
window.app = new TaskMaster();
