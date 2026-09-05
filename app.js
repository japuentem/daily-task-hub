/**
 * TaskMaster Pro - Hybrid Redesign (Teams + Trello)
 * Author: Antigravity AI
 */

/**
 * StorageManager - Robust persistence using IndexedDB
 */
class StorageManager {
    constructor(dbName = 'TaskMasterDB', storeName = 'appData') {
        this.dbName = dbName;
        this.storeName = storeName;
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 2);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onerror = (event) => {
                console.error("IndexedDB error:", event.target.error);
                reject(event.target.error);
            };
        });
    }

    async save(key, data) {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put(data, key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async load(key) {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
}

class TaskMaster {
    constructor() {
        this.storage = new StorageManager();
        this.isInitialized = false;
        
        // Initialize with empty defaults, will be populated async
        this.tasks = [];
        this.notes = [];
        this.servers = [];
        this.categories = ["Generales", "Trabajo", "Personal", "Reuniones"];
        this.agendaDrafts = {};
        this.pendientes = [];
        this.trash = [];
        this.directory = [];
        this.files = [];
        this.passwords = [];
        this.fileSearchTerm = '';
        this.selectedFileFilter = 'all';
        this.theme = 'dark';
        this.activeTab = 'tabCommandCenter';
        // New modules
        this.events = [];
        this.eventFilter = 'all';
        this.batConfig = { batPath: '', outputDir: '', timeout: 60, files: ['', '', ''] };
        this.batOutput = null;
        this.batRunning = false;
        this.batActiveTab = 0;
        this.quoteTimerId = null;
        
        // Versioning properties
        this.isPreviewMode = false;
        this.currentVersionId = null;
        this.versions = [];
        
        this.searchTerm = '';
        this.editingTaskId = null;
        this.editingNoteId = null;
        this.editingServerId = null;
        this.editingContactId = null;
        this.draggingNoteId = null;
        this.notifiedItems = new Set();
        this.dismissedReminders = new Set(JSON.parse(localStorage.getItem('tm_dismissed_reminders') || '[]'));
        this.notifiedMeetingReminderIds = new Set();
        this.selectedNoteColor = 'yellow';
        this.currentCustomRecurrence = null;
        this.currentAgendaDate = new Date();
        this.editingPendienteId = null;
        this.lastAudioNotifiedTaskId = null;
        
        this.pomodoro = {
            timer: null,
            timeLeft: 1500,
            isActive: false,
            mode: 'work'
        };

        this.masterKey = null;
        this.vaultUnlocked = false;

        this.init();
    }

    async init() {
        try {
            await this.storage.init();
            await this.loadAllData();
            this.isInitialized = true;
        } catch (e) {
            console.error("Failed to init storage, falling back to localStorage", e);
            this.loadFromLocalStorage(); // Fallback
        }

        this.cacheDOM();
        this.applyTheme();
        this.bindEvents();
        this.updateDateDisplay();
        this.updateCategorySelect();
        this.renderAll();
        this.startBackgroundProcesses();
        console.log("TaskMaster initialized with robust storage");
        
        // Final sanity check for UI
        this.updateStorageStatus();
    }

    async loadAllData() {
        try {
            const response = await fetch('/api/data');
            if (response.ok) {
                const data = await response.json();
                this.tasks = data.tasks || [];
                this.notes = data.notes || [];
                this.servers = data.servers || [];
                this.categories = (data.categories && data.categories.length > 0) ? data.categories : this.categories;
                this.agendaDrafts = data.agenda || {};
                
                // MIGRATION: Convert old pendientes to tasks
                let oldPendientes = data.pendientes || [];
                if (oldPendientes.length > 0) {
                    oldPendientes.forEach(p => {
                        this.tasks.push({
                            id: p.id || Date.now() + Math.floor(Math.random() * 1000),
                            title: p.text || p.title || 'Sin título',
                            priority: 'media',
                            category: 'Generales',
                            completed: !!p.completed,
                            status: 'todo'
                        });
                    });
                }
                this.pendientes = []; // Obsolete
                
                this.trash = data.trash || [];
                this.directory = data.directory || [];
                this.files = data.files || [];
                this.passwords = data.passwords || [];
                this.currentVersionId = data.versionId;
                this.isOffline = false;
                // New modules from localStorage (not Oracle)
                this.events = JSON.parse(localStorage.getItem('tm_events')) || [];
                this.batConfig = JSON.parse(localStorage.getItem('tm_bat_config')) || this.batConfig;
            } else {
                const err = await response.json();
                this.isOffline = !!err.isOffline;
                await this.loadFromIndexedDBOrLocalStorage();
            }
        } catch (e) {
            console.warn("Communication with server interrupted. Executing local retrieval protocols.", e);
            this.isOffline = true;
            await this.loadFromIndexedDBOrLocalStorage();
        }
        this.theme = localStorage.getItem('tm_theme') || 'dark';
        this.activeTab = localStorage.getItem('tm_active_tab') || 'tabCommandCenter';
    }

    async loadFromIndexedDBOrLocalStorage() {
        try {
            const data = await this.storage.load('allData');
            if (data) {
                this.tasks = data.tasks || [];
                this.notes = data.notes || [];
                this.servers = data.servers || [];
                this.categories = data.categories || this.categories;
                this.agendaDrafts = data.agendaDrafts || {};
                
                // MIGRATION: Convert old pendientes to tasks (IndexedDB/Local)
                let oldPendientes = data.pendientes || [];
                if (oldPendientes.length > 0) {
                    oldPendientes.forEach(p => {
                        this.tasks.push({
                            id: p.id || Date.now() + Math.floor(Math.random() * 1000),
                            title: p.text || p.title || 'Sin título',
                            priority: 'media',
                            category: 'Generales',
                            completed: !!p.completed,
                            status: 'todo'
                        });
                    });
                }
                this.pendientes = []; // Obsolete
                
                this.trash = data.trash || [];
                this.directory = data.directory || [];
                this.files = data.files || [];
                this.passwords = data.passwords || [];
                this.events = data.events || JSON.parse(localStorage.getItem('tm_events')) || [];
                this.batConfig = data.batConfig || JSON.parse(localStorage.getItem('tm_bat_config')) || this.batConfig;
            } else {
                this.loadFromLocalStorage();
            }
        } catch (err) {
            this.loadFromLocalStorage();
        }
    }

    loadFromLocalStorage() {
        this.tasks = JSON.parse(localStorage.getItem('tm_tasks')) || [];
        this.notes = JSON.parse(localStorage.getItem('tm_notes')) || [];
        this.servers = JSON.parse(localStorage.getItem('tm_servers')) || [];
        this.categories = JSON.parse(localStorage.getItem('tm_categories')) || this.categories;
        this.agendaDrafts = JSON.parse(localStorage.getItem('tm_agenda_drafts')) || {};
        this.pendientes = JSON.parse(localStorage.getItem('tm_pendientes')) || [];
        this.trash = JSON.parse(localStorage.getItem('tm_trash')) || [];
        this.directory = JSON.parse(localStorage.getItem('tm_directory')) || [];
        this.files = JSON.parse(localStorage.getItem('tm_files')) || [];
        this.passwords = JSON.parse(localStorage.getItem('tm_passwords')) || [];
        this.events = JSON.parse(localStorage.getItem('tm_events')) || [];
        this.batConfig = JSON.parse(localStorage.getItem('tm_bat_config')) || this.batConfig;
        this.theme = localStorage.getItem('tm_theme') || 'dark';
        this.activeTab = localStorage.getItem('tm_active_tab') || 'tabCommandCenter';
    }

    cacheDOM() {
        this.appLayout = document.querySelector('.app-layout');
        this.btnPomodoro = document.getElementById('btnPomodoro');
        this.btnSummary = document.getElementById('btnSummary');
        this.btnThemeToggle = document.getElementById('btnThemeToggle');
        this.btnSettings = document.getElementById('btnSettings');
        this.btnExport = document.getElementById('btnExport');
        this.btnExportJson = document.getElementById('btnExportJson');
        this.btnSaveVersion = document.getElementById('btnSaveVersion');
        this.currentDateDisplay = document.getElementById('currentDateDisplay');
        this.searchInput = document.getElementById('searchInput');

        this.itemsBacklog = document.getElementById('items-backlog');
        this.itemsTodo = document.getElementById('items-todo');
        this.itemsDone = document.getElementById('items-done');
        this.countBacklog = document.getElementById('count-backlog');
        this.countTodo = document.getElementById('count-todo');
        this.countDone = document.getElementById('count-done');

        this.agendaGrid = document.getElementById('agendaGrid');
        this.agendaBoard = document.querySelector('.agenda-board');
        this.agendaEventsContainer = document.getElementById('agendaEventsContainer');
        this.agendaTitle = document.getElementById('agendaTitle');

        // Notes Kanban
        this.noteImportanceContainers = {
            1: document.getElementById('notes-importance-1'),
            2: document.getElementById('notes-importance-2'),
            3: document.getElementById('notes-importance-3'),
            4: document.getElementById('notes-importance-4')
        };

        this.modalTask = document.getElementById('modalTask');
        this.modalNote = document.getElementById('modalNote');
        this.modalServer = document.getElementById('modalServer');
        this.modalPomodoro = document.getElementById('modalPomodoro');
        this.modalSummary = document.getElementById('modalSummary');
        this.modalRecurrence = document.getElementById('modalRecurrence');

        this.taskForm = document.getElementById('taskForm');
        this.noteForm = document.getElementById('noteForm');
        this.serverForm = document.getElementById('serverForm');

        this.taskTitle = document.getElementById('taskTitle');
        this.taskPriority = document.getElementById('taskPriority');
        this.taskCategory = document.getElementById('taskCategory');
        this.btnAddCategory = document.getElementById('btnAddCategory');
        this.taskStart = document.getElementById('taskStart');
        this.taskEnd = document.getElementById('taskEnd');
        this.taskRecurrence = document.getElementById('taskRecurrence');
        this.btnSubmitTask = document.getElementById('btnSubmitTask');
        this.btnCancelEdit = document.getElementById('btnCancelEdit');

        this.taskDependencyType = document.getElementById('taskDependencyType');
        this.taskDependencyArea = document.getElementById('taskDependencyArea');
        this.taskDependencyAreaContainer = document.getElementById('taskDependencyAreaContainer');

        this.taskTimelineList = document.getElementById('taskTimelineList');
        this.taskTimelineInput = document.getElementById('taskTimelineInput');
        this.btnAddTimelineEntry = document.getElementById('btnAddTimelineEntry');

        this.serverIP = document.getElementById('serverIP');
        this.serverHostname = document.getElementById('serverHostname');
        this.serverApp = document.getElementById('serverApp');
        this.serverDB = document.getElementById('serverDB');
        this.serverUser = document.getElementById('serverUser');
        this.serverCurrentPass = document.getElementById('serverCurrentPass');
        this.serverPrevPass = document.getElementById('serverPrevPass');
        this.serverNotes = document.getElementById('serverNotes');
        this.serverEnvironment = document.getElementById('serverEnvironment');
        this.serverHasOracle = document.getElementById('serverHasOracle');
        this.serverHasJboss = document.getElementById('serverHasJboss');
        this.btnSubmitServer = document.getElementById('btnSubmitServer');
        this.btnCancelServerEdit = document.getElementById('btnCancelServerEdit');
        this.serverList = document.getElementById('serverList');
        this.btnOpenServerForm = document.getElementById('btnOpenServerForm');

        this.modalServerNotes = document.getElementById('modalServerNotes');
        this.serverNotesHostname = document.getElementById('serverNotesHostname');
        this.serverNotesText = document.getElementById('serverNotesText');
        this.btnCopyServerNotes = document.getElementById('btnCopyServerNotes');

        this.recStart = document.getElementById('recStart');
        this.recInterval = document.getElementById('recInterval');
        this.recType = document.getElementById('recType');
        this.recEnd = document.getElementById('recEnd');
        this.recSummaryText = document.getElementById('recSummaryText');
        this.btnSaveRecurrence = document.getElementById('btnSaveRecurrence');
        this.sectionWeekly = document.getElementById('sectionWeekly');
        this.sectionMonthly = document.getElementById('sectionMonthly');
        this.sectionYearly = document.getElementById('sectionYearly');
        this.taskWeeklyDaysContainer = document.getElementById('taskWeeklyDaysContainer');
        this.taskDayPicker = document.getElementById('taskDayPicker');

        this.patMonthDay = document.getElementById('patMonthDay');
        this.recMonthDay = document.getElementById('recMonthDay');
        this.recMonthWeek = document.getElementById('recMonthWeek');
        this.recMonthDayName = document.getElementById('recMonthDayName');

        this.recYearDay = document.getElementById('recYearDay');
        this.recYearMonth = document.getElementById('recYearMonth');

        this.taskMonthlyContainer = document.getElementById('taskMonthlyContainer');
        this.taskPatMonthDay = document.getElementById('taskPatMonthDay');
        this.taskMonthDay = document.getElementById('taskMonthDay');
        this.taskPatMonthRelative = document.getElementById('taskPatMonthRelative');
        this.taskMonthWeek = document.getElementById('taskMonthWeek');
        this.taskMonthDayName = document.getElementById('taskMonthDayName');

        this.taskYearlyContainer = document.getElementById('taskYearlyContainer');
        this.taskYearDay = document.getElementById('taskYearDay');
        this.taskYearMonth = document.getElementById('taskYearMonth');

        this.noteText = document.getElementById('noteText');
        this.noteImportance = document.getElementById('noteImportance');
        this.noteDate = document.getElementById('noteDate');
        this.btnSaveNote = document.getElementById('btnSaveNote');

        this.pomodoroDisplay = document.getElementById('pomodoroDisplay');
        this.pomodoroMode = document.getElementById('pomodoroMode');
        this.btnPomodoroStart = document.getElementById('btnPomodoroStart');
        this.btnPomodoroReset = document.getElementById('btnPomodoroReset');

        this.closeModalBtns = document.querySelectorAll('.close-modal');
        this.btnCloseRecurrenceModal = document.getElementById('btnCloseRecurrenceModal');
        this.colorBtns = document.querySelectorAll('.color-btn');
        this.summaryText = document.getElementById('summaryText');
        this.btnCopySummary = document.getElementById('btnCopySummary');
        this.toastContainer = document.getElementById('toastContainer');
        this.btnOpenTaskForm = document.getElementById('btnOpenTaskForm');
        this.btnOpenNoteForm = document.getElementById('btnOpenNoteForm');

        // Tabs
        this.tabBtns = document.querySelectorAll('.tab-btn');
        this.tabPanes = document.querySelectorAll('.tab-pane');

        // Quick Task (reemplaza Pendientes)
        this.quickTaskInput = document.getElementById('quickTaskInput');
        this.btnSaveQuickTask = document.getElementById('btnSaveQuickTask');

        // Hierarchical Tasks Elements
        this.btnToggleBulkImport = document.getElementById('btnToggleBulkImport');
        this.btnCopyHierarchicalText = document.getElementById('btnCopyHierarchicalText');
        this.btnExportHierarchicalImage = document.getElementById('btnExportHierarchicalImage');
        this.btnClearHierarchicalTasks = document.getElementById('btnClearHierarchicalTasks');
        this.bulkImportArea = document.getElementById('bulkImportArea');
        this.bulkImportTextarea = document.getElementById('bulkImportTextarea');
        this.btnCancelBulkImport = document.getElementById('btnCancelBulkImport');
        this.btnSubmitBulkImport = document.getElementById('btnSubmitBulkImport');
        this.hierarchicalTree = document.getElementById('hierarchicalTree');

        // Trash
        this.trashContainer = document.getElementById('trashContainer');
        this.btnClearTrash = document.getElementById('btnClearTrash');

        // Directorio
        this.modalContact = document.getElementById('modalContact');
        this.contactForm = document.getElementById('contactForm');
        this.contactName = document.getElementById('contactName');
        this.contactPhone = document.getElementById('contactPhone');
        this.contactEmail = document.getElementById('contactEmail');
        this.contactNotes = document.getElementById('contactNotes');
        this.contactSupportActions = document.getElementById('contactSupportActions');
        this.contactList = document.getElementById('contactList');
        this.btnOpenContactForm = document.getElementById('btnOpenContactForm');
        this.btnSubmitContact = document.getElementById('btnSubmitContact');
        this.btnCancelContactEdit = document.getElementById('btnCancelContactEdit');
        this.directorySearchInput = document.getElementById('directorySearchInput');
        this.serverSearchInput = document.getElementById('serverSearchInput');

        // Passwords
        this.modalPassword = document.getElementById('modalPassword');
        this.passwordForm = document.getElementById('passwordForm');
        this.passTitle = document.getElementById('passTitle');
        this.passUser = document.getElementById('passUser');
        this.passValue = document.getElementById('passValue');
        this.passUrl = document.getElementById('passUrl');
        this.passNotes = document.getElementById('passNotes');
        this.passwordList = document.getElementById('passwordList');
        this.btnOpenPasswordForm = document.getElementById('btnOpenPasswordForm');
        this.btnSubmitPassword = document.getElementById('btnSubmitPassword');
        this.btnCancelPasswordEdit = document.getElementById('btnCancelPasswordEdit');
        this.passwordSearchInput = document.getElementById('passwordSearchInput');

        // Versioning elements
        this.versionsList = document.getElementById('versionsList');
        this.btnRefreshVersions = document.getElementById('btnRefreshVersions');
        this.previewBanner = document.getElementById('previewBanner');
        this.previewBannerText = document.getElementById('previewBannerText');
        this.btnRestorePreview = document.getElementById('btnRestorePreview');
        this.btnExitPreview = document.getElementById('btnExitPreview');

        // Documents elements
        this.fileDropZone = document.getElementById('fileDropZone');
        this.fileUploadInput = document.getElementById('fileUploadInput');
        this.documentsGrid = document.getElementById('documentsGrid');
        this.documentSearchInput = document.getElementById('documentSearchInput');
        this.modalFilePreview = document.getElementById('modalFilePreview');
        this.previewFileName = document.getElementById('previewFileName');
        this.filePreviewBody = document.getElementById('filePreviewBody');
        this.btnDownloadPreviewFile = document.getElementById('btnDownloadPreviewFile');
        this.closePreviewModal = document.getElementById('closePreviewModal');

        this.btnUnlockVault = document.getElementById('btnUnlockVault');
        this.modalMasterPassword = document.getElementById('modalMasterPassword');
        this.masterPasswordForm = document.getElementById('masterPasswordForm');
        this.inputMasterPassword = document.getElementById('inputMasterPassword');
        this.masterPasswordTitle = document.getElementById('masterPasswordTitle');
        this.masterPasswordDesc = document.getElementById('masterPasswordDesc');
        this.btnSubmitMasterPassword = document.getElementById('btnSubmitMasterPassword');
    }

    bindEvents() {
        this.btnOpenTaskForm.addEventListener('click', () => this.openTaskModal());
        this.btnOpenNoteForm.addEventListener('click', () => this.openNoteModal());
        this.btnPomodoro.addEventListener('click', () => this.openModal(this.modalPomodoro));
        this.btnSummary.addEventListener('click', () => this.showSummary());
        this.btnSettings.addEventListener('click', () => document.getElementById('inputFileJson').click());

        this.closeModalBtns.forEach(btn => btn.addEventListener('click', () => this.closeAllModals()));
        if (this.btnCloseRecurrenceModal) {
            this.btnCloseRecurrenceModal.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeRecurrenceModal();
            });
        }
        if (this.modalRecurrence) {
            this.modalRecurrence.addEventListener('click', (e) => {
                if (e.target === this.modalRecurrence) {
                    this.closeRecurrenceModal();
                }
            });
        }
        this.taskForm.addEventListener('submit', (e) => { e.preventDefault(); this.saveTask(); });
        
        if (this.btnAddTimelineEntry) {
            this.btnAddTimelineEntry.addEventListener('click', () => this.addTimelineEntry());
        }
        if (this.taskTimelineInput) {
            this.taskTimelineInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.addTimelineEntry();
                }
            });
        }

        this.btnSaveNote.addEventListener('click', () => this.saveNote());

        this.btnThemeToggle.addEventListener('click', () => this.toggleTheme());
        this.btnExport.addEventListener('click', () => this.exportToExcel());
        this.btnExportJson.addEventListener('click', () => this.exportJson());
        this.btnSaveVersion.addEventListener('click', () => this.saveVersionToDB());
        const storageStatusEl = document.getElementById('storageStatus');
        if (storageStatusEl) {
            storageStatusEl.addEventListener('click', () => {
                if (this.isOffline) {
                    this.manualReconnectDB();
                } else {
                    this.showToast('🟢 Base de datos Oracle conectada y activa.');
                }
            });
        }
        document.getElementById('inputFileJson').addEventListener('change', (e) => this.importJson(e));
        if (this.btnCopySummary) this.btnCopySummary.addEventListener('click', () => this.copySummary());

        if (this.btnUnlockVault) this.btnUnlockVault.addEventListener('click', () => this.toggleVaultLock());
        if (this.masterPasswordForm) this.masterPasswordForm.addEventListener('submit', (e) => { e.preventDefault(); this.submitMasterPassword(); });

        if (this.btnOpenPasswordForm) this.btnOpenPasswordForm.addEventListener('click', () => this.openPasswordModal());
        if (this.passwordForm) this.passwordForm.addEventListener('submit', (e) => { e.preventDefault(); this.savePassword(); });
        if (this.btnCancelPasswordEdit) this.btnCancelPasswordEdit.addEventListener('click', () => { this.closeAllModals(); this.btnCancelPasswordEdit.style.display = 'none'; });
        if (this.passwordSearchInput) this.passwordSearchInput.addEventListener('input', (e) => { this.renderPasswords(); });

        this.searchInput.addEventListener('input', (e) => {
            this.searchTerm = e.target.value.toLowerCase();
            this.renderAll();
        });

        this.btnAddCategory.addEventListener('click', () => this.addCategory());
        this.taskStart.addEventListener('change', () => this.suggestEndTime());

        this.btnSaveRecurrence.addEventListener('click', () => this.saveRecurrenceUI());
        [this.recInterval, this.recType, this.recStart, this.recEnd, this.recMonthDay,
        this.recMonthWeek, this.recMonthDayName, this.recYearDay, this.recYearMonth].forEach(el => {
            el.addEventListener('change', () => this.updateRecurrenceSummary());
        });

        document.querySelectorAll('.day-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                btn.classList.toggle('active');
                this.updateRecurrenceSummary();
            });
        });

        this.colorBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.colorBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedNoteColor = btn.dataset.color;
            });
        });

        this.btnPomodoroStart.addEventListener('click', () => this.togglePomodoro());
        this.btnPomodoroReset.addEventListener('click', () => this.resetPomodoro());
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.modalRecurrence && this.modalRecurrence.style.display === 'block') {
                    this.closeRecurrenceModal();
                } else {
                    this.closeAllModals();
                }
            }
        });
        const evModalEl = document.getElementById('eventFormModal');
        if (evModalEl) {
            evModalEl.addEventListener('click', (e) => { if (e.target === evModalEl) this.closeEventForm(); });
        }
        window.addEventListener('beforeunload', () => {
            if (this._syncTimer) {
                clearTimeout(this._syncTimer);
                this.syncToDatabase();
            }
        });

        // DELEGATED NOTE LISTENERS
        if (this.noteImportanceContainers) {
            Object.values(this.noteImportanceContainers).forEach(container => {
                if (container) {
                    container.addEventListener('click', (e) => {
                        const card = e.target.closest('.note-card');
                        if (!card) return;

                        const id = parseInt(card.dataset.id);
                        const btnEdit = e.target.closest('.btn-edit-note');
                        const btnDelete = e.target.closest('.btn-delete-note');

                        if (btnEdit) {
                            e.stopPropagation();
                            this.editNote(id);
                        } else if (btnDelete) {
                            e.stopPropagation();
                            this.deleteNote(id);
                        } else {
                            this.toggleNote(card);
                        }
                    });
                }
            });
        }

        this.initDragAndDrop();

        // Tabs switching
        this.tabBtns.forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });

        // Quick Task
        if (this.btnSaveQuickTask) {
            this.btnSaveQuickTask.addEventListener('click', () => this.saveQuickTask());
        }
        if (this.quickTaskInput) {
            this.quickTaskInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.saveQuickTask();
            });
        }

        // Hierarchical Tasks Events
        if (this.btnToggleBulkImport) {
            this.btnToggleBulkImport.addEventListener('click', () => {
                const isHidden = this.bulkImportArea.style.display === 'none';
                this.bulkImportArea.style.display = isHidden ? 'block' : 'none';
            });
        }
        if (this.btnCancelBulkImport) {
            this.btnCancelBulkImport.addEventListener('click', () => {
                this.bulkImportArea.style.display = 'none';
                this.bulkImportTextarea.value = '';
            });
        }
        if (this.btnSubmitBulkImport) {
            this.btnSubmitBulkImport.addEventListener('click', () => this.submitBulkImport());
        }
        if (this.btnClearHierarchicalTasks) {
            this.btnClearHierarchicalTasks.addEventListener('click', () => this.clearHierarchicalTasks());
        }
        if (this.btnCopyHierarchicalText) {
            this.btnCopyHierarchicalText.addEventListener('click', () => this.copyHierarchicalText());
        }
        if (this.btnExportHierarchicalImage) {
            this.btnExportHierarchicalImage.addEventListener('click', () => this.exportHierarchicalImage());
        }

        // Trash
        this.btnClearTrash.addEventListener('click', () => this.emptyTrash());

        // Server Vault
        if (this.btnOpenServerForm) {
            this.btnOpenServerForm.addEventListener('click', () => this.openServerModal());
        }
        if (this.serverForm) {
            this.serverForm.addEventListener('submit', (e) => { e.preventDefault(); this.saveServer(); });
        }
        if (this.btnCopyServerNotes) {
            this.btnCopyServerNotes.addEventListener('click', () => {
                this.copyText(this.serverNotesText.value, 'Notas del servidor copiadas al portapapeles');
            });
        }
        document.querySelectorAll('.btn-toggle-pass').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = btn.dataset.target;
                const input = document.getElementById(targetId);
                if (input) {
                    const isPass = input.type === 'password';
                    input.type = isPass ? 'text' : 'password';
                    btn.textContent = isPass ? '🔒' : '👁️';
                }
            });
        });

        // Directorio Events
        if (this.btnOpenContactForm) {
            this.btnOpenContactForm.addEventListener('click', () => this.openContactModal());
        }
        if (this.contactForm) {
            this.contactForm.addEventListener('submit', (e) => { e.preventDefault(); this.saveContact(); });
        }
        if (this.directorySearchInput) {
            this.directorySearchInput.addEventListener('input', () => this.renderDirectory());
        }
        if (this.serverSearchInput) {
            this.serverSearchInput.addEventListener('input', () => this.renderServers());
        }
        if (this.btnRefreshVersions) {
            this.btnRefreshVersions.addEventListener('click', () => this.loadVersionsList());
        }
        if (this.btnRestorePreview) {
            this.btnRestorePreview.addEventListener('click', () => this.restorePreviewedVersion());
        }
        if (this.btnExitPreview) {
            this.btnExitPreview.addEventListener('click', () => this.exitPreviewMode());
        }

        // Documents Event Listeners
        if (this.fileUploadInput) {
            this.fileUploadInput.addEventListener('change', (e) => this.handleFileUpload(e));
        }
        if (this.fileDropZone) {
            this.fileDropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                this.fileDropZone.classList.add('drag-over');
            });
            this.fileDropZone.addEventListener('dragleave', (e) => {
                e.preventDefault();
                this.fileDropZone.classList.remove('drag-over');
            });
            this.fileDropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                this.fileDropZone.classList.remove('drag-over');
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    this.uploadFiles(e.dataTransfer.files);
                }
            });
            this.fileDropZone.addEventListener('click', () => {
                this.fileUploadInput.click();
            });
        }
        if (this.documentSearchInput) {
            this.documentSearchInput.addEventListener('input', (e) => {
                this.fileSearchTerm = e.target.value.toLowerCase();
                this.renderDocuments();
            });
        }
        document.querySelectorAll('.document-filters .btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.document-filters .btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedFileFilter = btn.dataset.filter;
                this.renderDocuments();
            });
        });
        if (this.closePreviewModal) {
            this.closePreviewModal.addEventListener('click', () => {
                if (this.modalServer) this.modalServer.style.display = 'none';
                if (this.modalContact) this.modalContact.style.display = 'none';
                if (this.modalPassword) this.modalPassword.style.display = 'none';
                if (this.modalFilePreview) this.modalFilePreview.style.display = 'none';
                this.filePreviewBody.innerHTML = '';
            });
        }

        // Ensure active tab is shown on init
        this.switchTab(this.activeTab, false);
    }

    // --- AGENDA NAVIGATION ---

    changeAgendaDate(offset) {
        this.currentAgendaDate.setDate(this.currentAgendaDate.getDate() + offset);
        this.renderAgenda();
        this.updateAgendaTitle();
    }

    updateAgendaTitle() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const target = new Date(this.currentAgendaDate);
        target.setHours(0, 0, 0, 0);
        if (today.getTime() === target.getTime()) this.agendaTitle.textContent = "Agenda de Hoy";
        else this.agendaTitle.textContent = target.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
    }

    // --- RECURRENCE LOGIC ---

    isTaskActiveToday(task, targetDate = new Date()) {
        const targetStr = targetDate.toLocaleDateString('sv-SE');
        if (task.completed && (!task.recurrence || task.recurrence === 'none') && task.lastCompletedDate && task.lastCompletedDate !== targetStr) {
            return false;
        }

        if (!task.start) return false;

        // Normalize dates to midnight for comparison
        const startOfTarget = new Date(targetStr + 'T00:00:00');
        const endOfTarget = new Date(targetStr + 'T23:59:59');

        const taskStart = new Date(task.start);
        const taskEnd = task.end ? new Date(task.end) : new Date(taskStart.getTime() + 3600000);

        const taskOnlyStartDate = new Date(taskStart.getFullYear(), taskStart.getMonth(), taskStart.getDate());
        const targetOnlyDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());

        const rec = typeof task.recurrence === 'string' ? { type: task.recurrence } : task.recurrence;

        const effectiveStartDate = (rec && rec.start) ? new Date(rec.start + 'T00:00:00') : taskOnlyStartDate;
        if (targetOnlyDate < effectiveStartDate) return false;

        // One-time tasks logic
        if (!rec || rec.type === 'none') {
            return (taskStart <= endOfTarget && taskEnd >= startOfTarget);
        }

        if (rec.end && targetOnlyDate > new Date(rec.end + 'T23:59:59')) return false;

        const dayOfWeek = targetDate.getDay(), dateOfMonth = targetDate.getDate(), month = targetDate.getMonth();
        const diffDays = Math.floor((targetOnlyDate.getTime() - effectiveStartDate.getTime()) / (1000 * 60 * 60 * 24));

        if (task.recurrence === 'daily') {
            return dayOfWeek >= 1 && dayOfWeek <= 5;
        }
        if (task.recurrence === 'workdays') return dayOfWeek >= 1 && dayOfWeek <= 5;
        if (task.recurrence === 'weekly') {
            if (task.weekDays && task.weekDays.length > 0) return task.weekDays.includes(dayOfWeek);
            return dayOfWeek === taskStart.getDay();
        }
        if (task.recurrence === 'monthly') {
            if (task.monthPat === 'day') return dateOfMonth === (task.monthDay || taskStart.getDate());
            if (task.monthPat === 'relative') return dateOfMonth === this.getNthWeekdayOfMonth(targetDate.getFullYear(), targetDate.getMonth(), task.monthWeek, task.monthDayName);
            return dateOfMonth === taskStart.getDate();
        }
        if (task.recurrence === 'yearly') {
            const m = task.yearMonth !== undefined ? task.yearMonth : taskStart.getMonth();
            const d = task.yearDay !== undefined ? task.yearDay : taskStart.getDate();
            return month === m && dateOfMonth === d;
        }

        const interval = rec.interval || 1;
        if (rec.type === 'day') return diffDays % interval === 0;
        if (rec.type === 'week') {
            const targetDays = rec.weekDays || task.weekDays || [];
            if (!targetDays.includes(dayOfWeek)) return false;

            const startSunday = new Date(effectiveStartDate);
            startSunday.setDate(startSunday.getDate() - startSunday.getDay());
            const targetSunday = new Date(targetOnlyDate);
            targetSunday.setDate(targetSunday.getDate() - targetSunday.getDay());
            const weekDiff = Math.round((targetSunday.getTime() - startSunday.getTime()) / (7 * 24 * 60 * 60 * 1000));
            if (weekDiff < 0) return false;
            return weekDiff % interval === 0;
        }
        if (rec.type === 'month') {
            const monthDiff = (targetDate.getFullYear() - taskOnlyStartDate.getFullYear()) * 12 + (targetDate.getMonth() - taskOnlyStartDate.getMonth());
            if (monthDiff % interval !== 0) return false;
            if (rec.monthPat === 'day') return dateOfMonth === rec.monthDay;
            return dateOfMonth === this.getNthWeekdayOfMonth(targetDate.getFullYear(), targetDate.getMonth(), rec.monthWeek, rec.monthDayName);
        }
        if (rec.type === 'year') {
            const yearDiff = targetDate.getFullYear() - taskOnlyStartDate.getFullYear();
            if (yearDiff % interval !== 0) return false;
            return month === rec.yearMonth && dateOfMonth === rec.yearDay;
        }
        return false;
    }

    getNthWeekdayOfMonth(y, m, n, d) {
        let date;
        if (n === 'last') { date = new Date(y, m + 1, 0); while (date.getDay() !== d) date.setDate(date.getDate() - 1); }
        else { date = new Date(y, m, 1); let c = 0, nV = parseInt(n); while (c < nV) { if (date.getDay() === d) c++; if (c < nV) date.setDate(date.getDate() + 1); } }
        return date.getDate();
    }

    isTaskCompletedToday(t, s) {
        if (!t.completed) return false;
        return t.lastCompletedDate === s;
    }
    toggleCompletion(id) {
        const t = this.tasks.find(tk => tk.id === id); if (!t) return;
        const s = new Date().toLocaleDateString('sv-SE');
        if (this.isTaskCompletedToday(t, s)) {
            t.completed = false;
            t.lastCompletedDate = null;
        } else if (t.completed && (!t.recurrence || t.recurrence === 'none')) {
            t.completed = false;
            t.lastCompletedDate = null;
        } else {
            t.completed = true;
            t.lastCompletedDate = s;
        }
        this.saveAndRefresh();
    }

    // --- RENDERING ---
    renderAll() {
        this.renderTasks();
        this.renderAgenda();
        this.renderNotes();
        this.renderServers();
        this.renderDirectory();
        this.renderPasswords();
        this.renderTrash();
        this.renderDocuments();
        this.renderHierarchicalTasks();
        this.renderEvents();
        this.updateActiveTaskBanner();
        if (this.activeTab === 'tabCommandCenter') this.renderCommandCenter();
    }
    renderTasks() {
        const b = { backlog: [], todo: [], done: [] }, today = new Date(), s = today.toLocaleDateString('sv-SE');
        this.tasks.forEach(t => {
            if (t.completed && (!t.recurrence || t.recurrence === 'none') && t.lastCompletedDate && t.lastCompletedDate !== s) {
                return;
            }
            const act = this.isTaskActiveToday(t, today), comp = this.isTaskCompletedToday(t, s);
            if (t.title.toLowerCase().includes(this.searchTerm)) {
                const ut = { ...t, completed: comp };
                if (comp) {
                    b.done.push(ut);
                } else if (act || t.status === 'todo') {
                    b.todo.push(ut);
                } else {
                    b.backlog.push(ut);
                }
            }
        });
        this.itemsBacklog.innerHTML = b.backlog.map(t => this.createTaskCardHtml(t)).join('');
        this.itemsTodo.innerHTML = b.todo.map(t => this.createTaskCardHtml(t)).join('');
        if (this.itemsDone) this.itemsDone.innerHTML = b.done.map(t => this.createTaskCardHtml(t)).join('');
        
        this.countBacklog.textContent = b.backlog.length; 
        this.countTodo.textContent = b.todo.length;
        if (this.countDone) this.countDone.textContent = b.done.length;
    }
    createTaskCardHtml(t) {
        const p = { 'alta': '🔴 Urgente', 'baja': '🟢 Personal', 'trabajo': '🔵 Trabajo', 'media': '⚪ Estándar' };
        const checkboxIcon = t.completed ? '✅' : '⬜';
        let depHtml = '';
        if (t.dependencyType === 'me') {
            depHtml = `<span class="dep-badge dep-me">🙋 Depende de mí</span>`;
        } else if (t.dependencyType === 'area') {
            depHtml = `<span class="dep-badge dep-area">🏢 ${t.dependencyArea || 'Otra área'}</span>`;
        }
        return `
            <div class="task-card ${t.completed ? 'completed' : ''}" draggable="true" data-id="${t.id}" ondragstart="app.handleDragStart(event)">
                <div class="card-tags"><span class="tag tag-${(t.priority || 'media').toLowerCase()}">${p[t.priority] || 'Estándar'}</span>${depHtml}</div>
                <h3 onclick="app.toggleCompletion(${t.id})" style="cursor: pointer; display: flex; align-items: flex-start; gap: 8px;">
                    <span class="task-checkbox" style="font-size: 1.1em; line-height: 1.2;">${checkboxIcon}</span>
                    <span style="flex: 1;">${(t.recurrence && t.recurrence !== 'none') ? '🔄 ' : ''}${t.title}</span>
                </h3>
                <div class="card-footer"><span>${t.category || 'Gral'}</span><div class="card-actions"><button class="btn-icon" onclick="app.editTask(${t.id})">✏️</button><button class="btn-icon" onclick="app.deleteTask(${t.id})">🗑️</button></div></div>
            </div>`;
    }
    renderAgenda() {
        const startH = 6, endH = 23, sH = 80; let g = '';
        const target = new Date(this.currentAgendaDate); target.setHours(12, 0, 0, 0); const s = target.toLocaleDateString('sv-SE');

        const isWeekend = target.getDay() === 0 || target.getDay() === 6;
        if (this.agendaBoard) this.agendaBoard.classList.toggle('weekend-mode', isWeekend);

        for (let h = startH; h <= endH; h++) {
            const hv = h.toString().padStart(2, '0'); const hl = `${hv}:00`;
            g += `<div class="agenda-slot" data-hour="${hl}" ondragover="app.handleDragOver(event)" ondrop="app.handleDropToAgenda(event)">
                    <div class="slot-time">${hl}</div><div class="slot-content"><textarea class="slot-input" placeholder="Nota rápida..." oninput="app.saveAgendaDraft('${hl}', this.value)">${this.agendaDrafts[hl] || ''}</textarea></div>
                </div>`;
        }
        this.agendaGrid.innerHTML = g;
        const ats = this.tasks.filter(t => this.isTaskActiveToday(t, target)).sort((a, b) => {
            const da = new Date(a.start), db = new Date(b.start);
            const timeA = da.getHours() * 60 + da.getMinutes();
            const timeB = db.getHours() * 60 + db.getMinutes();
            if (timeA !== timeB) return timeA - timeB;
            const durA = (a.end ? new Date(a.end) : new Date(da.getTime() + 3600000)) - da;
            const durB = (b.end ? new Date(b.end) : new Date(db.getTime() + 3600000)) - db;
            return durB - durA;
        });

        const clusters = [];
        let currentCluster = null;

        ats.forEach(t => {
            const st = new Date(t.start);
            const et = t.end ? new Date(t.end) : new Date(st.getTime() + 3600000);
            const isMD = t.end && (new Date(new Date(t.end).setHours(0, 0, 0, 0)) > new Date(new Date(t.start).setHours(0, 0, 0, 0)));
            let sd = new Date(target.getFullYear(), target.getMonth(), target.getDate(), st.getHours(), st.getMinutes());
            let ed = new Date(target.getFullYear(), target.getMonth(), target.getDate(), et.getHours(), et.getMinutes());

            if (isMD && st.toLocaleDateString('sv-SE') < s) sd.setHours(startH, 0);
            if (isMD && et.toLocaleDateString('sv-SE') > s) ed = new Date(target.getFullYear(), target.getMonth(), target.getDate(), 23, 59);

            const startM = Math.max(startH * 60, sd.getHours() * 60 + sd.getMinutes());
            const endM = ed.getHours() * 60 + ed.getMinutes();

            t._tmp = { startM, endM, sd };

            if (!currentCluster || startM < currentCluster.maxEnd) {
                if (!currentCluster) {
                    currentCluster = { tasks: [], maxEnd: 0, columns: [] };
                    clusters.push(currentCluster);
                }
                currentCluster.tasks.push(t);
                if (endM > currentCluster.maxEnd) currentCluster.maxEnd = endM;
            } else {
                currentCluster = { tasks: [t], maxEnd: endM, columns: [] };
                clusters.push(currentCluster);
            }

            let colIndex = -1;
            for (let i = 0; i < currentCluster.columns.length; i++) {
                const lastInCol = currentCluster.columns[i][currentCluster.columns[i].length - 1];
                if (startM >= lastInCol._tmp.endM) {
                    colIndex = i;
                    break;
                }
            }
            if (colIndex === -1) {
                colIndex = currentCluster.columns.length;
                currentCluster.columns.push([]);
            }
            currentCluster.columns[colIndex].push(t);
            t._tmp.colIndex = colIndex;
        });

        let eh = '';
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const isTodaySelected = (new Date(target).toLocaleDateString('sv-SE') === now.toLocaleDateString('sv-SE'));

        clusters.forEach(cluster => {
            const numCols = cluster.columns.length;
            cluster.tasks.forEach(t => {
                const { startM, endM, sd, colIndex } = t._tmp;
                const top = (startM - startH * 60) * (sH / 60);
                const h = Math.max(40, (endM - startM) * (sH / 60));
                const w = (100 / numCols) - 1;
                const l = colIndex * (100 / numCols);

                const isCurrent = isTodaySelected && !this.isTaskCompletedToday(t, s) && (currentMinutes >= startM && currentMinutes < endM);

                eh += `<div class="agenda-event priority-${(t.priority || 'media').toLowerCase()} ${this.isTaskCompletedToday(t, s) ? 'completed' : ''} ${isCurrent ? 'is-current-active' : ''}" 
                         style="top: ${top}px; height: ${h}px; left: ${l}%; width: ${w}%;" draggable="true" ondragstart="app.handleDragStart(event)" data-id="${t.id}" onclick="app.editTask(${t.id})">
                        <span class="event-title">${t.title}</span><small>${sd.getHours()}:${sd.getMinutes().toString().padStart(2, '0')}</small>
                    </div>`;
                delete t._tmp;
            });
        });
        this.agendaEventsContainer.innerHTML = eh;
    }
    renderNotes() {
        // Clear all containers
        Object.values(this.noteImportanceContainers).forEach(c => c.innerHTML = '');

        this.notes.forEach(n => {
            if (n.text.toLowerCase().includes(this.searchTerm)) {
                const importance = n.importance || 2; // Default to Media
                const container = this.noteImportanceContainers[importance];
                if (container) {
                    container.innerHTML += `<div class="note-card note-${n.color || 'yellow'}" data-id="${n.id}" draggable="true" ondragstart="app.handleDragStart(event)">
                        <div class="note-actions"><button class="btn-icon btn-edit-note">✏️</button><button class="btn-icon btn-delete-note">🗑️</button></div>
                        <div class="note-content">${n.text}</div>
                    </div>`;
                }
            }
        });
    }

    renderPendientes() {
        const open = this.pendientes.filter(p => !p.completed).sort((a, b) => b.id - a.id);
        const closed = this.pendientes.filter(p => p.completed).sort((a, b) => b.finishedAtRaw - a.finishedAtRaw);

        this.listPendientesOpen.innerHTML = open.map(p => this.createPendienteHtml(p)).join('');
        this.listPendientesClosed.innerHTML = closed.map(p => this.createPendienteHtml(p)).join('');
    }

    createPendienteHtml(p) {
        return `
            <div class="pendiente-item ${p.completed ? 'completed' : ''}" data-id="${p.id}">
                <div class="pendiente-checkbox" onclick="app.togglePendiente(${p.id})"></div>
                <div class="pendiente-content">
                    <span class="pendiente-text">${p.text}</span>
                    <div class="pendiente-meta">
                        <span class="meta-date">🕒 Creado: ${p.createdAt}</span>
                        ${p.finishedAt ? `<span class="meta-date">✅ Fin: ${p.finishedAt}</span>` : ''}
                    </div>
                </div>
                <div class="pendiente-actions">
                    <button class="btn-icon btn-edit-pendiente" onclick="app.editPendiente(${p.id})" title="Editar">✏️</button>
                    <button class="btn-icon btn-delete-pendiente" onclick="app.deletePendiente(${p.id})" title="Eliminar">🗑️</button>
                </div>
            </div>
        `;
    }

    renderTrash() {
        if (this.trash.length === 0) {
            this.trashContainer.innerHTML = '<div class="empty-state">La papelera está vacía</div>';
            return;
        }

        const typeLabels = { task: 'Tarea', note: 'Nota', pendiente: 'Pendiente', server: 'Servidor', contacto: 'Contacto' };

        this.trashContainer.innerHTML = this.trash
            .sort((a, b) => b.deletedAtRaw - a.deletedAtRaw)
            .map(item => `
                <div class="trash-item type-${item.type}">
                    <div class="trash-type">${typeLabels[item.type] || item.type}</div>
                    <div class="trash-info">
                        <span class="trash-title">${item.data.title || item.data.text || (item.data.hostname ? `${item.data.hostname} (${item.data.ip})` : '')}</span>
                        <div class="trash-date">Eliminado el: ${item.deletedAt}</div>
                    </div>
                    <div class="trash-actions">
                        <button class="btn btn-secondary btn-small" onclick="app.restoreItem(${item.trashId})">Restaurar</button>
                        <button class="btn-icon" onclick="app.permanentlyDelete(${item.trashId})" title="Eliminar permanentemente">❌</button>
                    </div>
                </div>
            `).join('');
    }

    // --- DOCUMENTS LOGIC ---

    getFileGroup(type, name) {
        const ext = name.split('.').pop().toLowerCase();
        if (type.startsWith('image/')) return 'image';
        if (ext === 'pdf') return 'pdf';
        if (['doc', 'docx'].includes(ext)) return 'word';
        if (['xls', 'xlsx'].includes(ext)) return 'excel';
        if (['ppt', 'pptx'].includes(ext)) return 'powerpoint';
        return 'unknown';
    }

    renderDocuments() {
        if (!this.documentsGrid) return;

        let filtered = this.files.filter(f => f.name.toLowerCase().includes(this.fileSearchTerm));

        if (this.selectedFileFilter !== 'all') {
            filtered = filtered.filter(f => this.getFileGroup(f.type, f.name) === this.selectedFileFilter);
        }

        if (filtered.length === 0) {
            this.documentsGrid.innerHTML = `
                <tr>
                    <td colspan="5" class="empty-state" style="text-align: center; padding: 3rem;">
                        <span class="empty-state-icon" style="font-size: 2.5rem; display: block; margin-bottom: 10px; opacity: 0.5;">📂</span>
                        <p>No se encontraron documentos.</p>
                    </td>
                </tr>
            `;
            return;
        }

        const typeIcons = {
            image: '🖼️',
            pdf: '📕',
            word: '📘',
            excel: '📗',
            powerpoint: '📙',
            unknown: '📄'
        };

        this.documentsGrid.innerHTML = filtered.map(f => {
            const group = this.getFileGroup(f.type, f.name);
            const icon = typeIcons[group] || '📄';
            const isImage = group === 'image';
            const canPreview = ['image', 'pdf', 'word', 'excel', 'powerpoint'].includes(group);

            return `
                <tr data-id="${f.id}">
                    <td style="text-align: center;">
                        <div class="doc-type-icon doc-type-${group}">${icon}</div>
                    </td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 12px;">
                            ${isImage ? `<img src="${f.base64Data}" alt="thumbnail" class="doc-table-thumbnail">` : ''}
                            <span style="font-weight: 500; color: var(--text-primary); word-break: break-word;">${f.name}</span>
                        </div>
                    </td>
                    <td style="font-family: monospace; opacity: 0.8;">${f.sizeFormatted}</td>
                    <td style="font-size: 0.85rem; color: var(--text-secondary);">${f.uploadedAt}</td>
                    <td style="text-align: center;">
                        <div class="contact-actions" style="justify-content: center;">
                            ${canPreview ? `<button class="btn-icon" onclick="app.previewFile(${f.id})" title="Previsualizar" type="button">👁️</button>` : ''}
                            <button class="btn-icon" onclick="app.downloadFile(${f.id})" title="Descargar" type="button">📥</button>
                            <button class="btn-icon" onclick="app.deleteFile(${f.id})" title="Eliminar" type="button">🗑️</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    handleFileUpload(e) {
        if (e.target.files && e.target.files.length > 0) {
            this.uploadFiles(e.target.files);
        }
    }

    async uploadFiles(filesList) {
        let uploadedCount = 0;
        for (let i = 0; i < filesList.length; i++) {
            const file = filesList[i];
            
            // Limit to 10MB per file
            if (file.size > 10 * 1024 * 1024) {
                this.showToast(`Archivo ${file.name} supera el límite de 10MB`, 4000);
                continue;
            }

            try {
                const base64 = await this.fileToBase64(file);
                const uploadedAt = new Date().toLocaleDateString('es-ES', {
                    day: '2-digit', month: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit'
                });
                
                this.files.unshift({
                    id: Date.now() + i, // Unique ID
                    name: file.name,
                    type: file.type,
                    size: file.size,
                    sizeFormatted: this.formatBytes(file.size),
                    base64Data: base64,
                    uploadedAt: uploadedAt
                });
                uploadedCount++;
            } catch (err) {
                console.error("Error converting file to base64:", err);
                this.showToast(`Error al subir ${file.name}`, 4000);
            }
        }
        if (uploadedCount > 0) {
            this.showToast(`${uploadedCount} archivo(s) subido(s) correctamente.`);
            this.saveAndRefresh();
        }
    }

    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    }

    formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    downloadFile(id) {
        const file = this.files.find(f => f.id === id);
        if (!file) return;

        const link = document.createElement('a');
        link.href = file.base64Data;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    base64ToArrayBuffer(base64) {
        const binaryString = window.atob(base64.split(',')[1]);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }

    previewFile(id) {
        const file = this.files.find(f => f.id === id);
        if (!file) return;

        if (!this.modalFilePreview || !this.filePreviewBody || !this.previewFileName) return;

        this.previewFileName.textContent = file.name;
        this.filePreviewBody.innerHTML = '<div style="color: var(--text-secondary); padding: 2rem;">Cargando previsualización...</div>';

        const group = this.getFileGroup(file.type, file.name);

        if (group === 'image') {
            this.filePreviewBody.innerHTML = '';
            const img = document.createElement('img');
            img.src = file.base64Data;
            img.alt = file.name;
            this.filePreviewBody.appendChild(img);
        } else if (group === 'pdf') {
            this.filePreviewBody.innerHTML = '';
            const iframe = document.createElement('iframe');
            iframe.src = file.base64Data;
            this.filePreviewBody.appendChild(iframe);
        } else if (group === 'word') {
            try {
                const arrayBuffer = this.base64ToArrayBuffer(file.base64Data);
                window.mammoth.convertToHtml({ arrayBuffer: arrayBuffer })
                    .then(result => {
                        this.filePreviewBody.innerHTML = '';
                        const docEl = document.createElement('div');
                        docEl.className = 'docx-preview-container';
                        docEl.innerHTML = result.value || '<p style="text-align:center; color: var(--text-secondary);">El documento está vacío.</p>';
                        this.filePreviewBody.appendChild(docEl);
                    })
                    .catch(err => {
                        console.error(err);
                        this.filePreviewBody.innerHTML = '<p style="color: var(--danger); padding: 2rem; text-align: center;">Error al convertir documento Word a HTML. Asegúrate de que no sea un archivo de Word antiguo (.doc) o esté dañado.</p>';
                    });
            } catch (err) {
                console.error(err);
                this.filePreviewBody.innerHTML = '<p style="color: var(--danger); padding: 2rem; text-align: center;">Error al leer el archivo Word.</p>';
            }
        } else if (group === 'excel') {
            try {
                const arrayBuffer = this.base64ToArrayBuffer(file.base64Data);
                const data = new Uint8Array(arrayBuffer);
                const workbook = window.XLSX.read(data, { type: 'array' });
                
                this.filePreviewBody.innerHTML = '';
                
                const sheetEl = document.createElement('div');
                sheetEl.className = 'xlsx-preview-container';
                
                // Active sheet rendering helper
                const renderSheet = (sheetName) => {
                    const worksheet = workbook.Sheets[sheetName];
                    const htmlTable = window.XLSX.utils.sheet_to_html(worksheet, { editable: false });
                    
                    const tabHeaderHtml = workbook.SheetNames.map(name => `
                        <button class="btn btn-secondary ${name === sheetName ? 'active' : ''}" style="padding: 4px 12px; font-size: 0.8rem;" onclick="window._previewExcelSheet('${id}', '${name.replace(/'/g, "\\'")}')">${name}</button>
                    `).join('');
                    
                    sheetEl.innerHTML = `
                        <div style="background: rgba(0,0,0,0.15); padding: 8px 12px; display: flex; gap: 8px; border-bottom: 1px solid var(--border-color); overflow-x: auto;">
                            ${tabHeaderHtml}
                        </div>
                        <div style="flex: 1; overflow: auto; padding: 1.5rem; background: var(--bg-color); max-height: calc(85vh - 120px);">
                            ${htmlTable}
                        </div>
                    `;
                };

                // Expose rendering method globally for tab switching in preview
                window._previewExcelSheet = (fid, sheetName) => {
                    if (file.id === parseInt(fid)) {
                        renderSheet(sheetName);
                    }
                };

                renderSheet(workbook.SheetNames[0]);
                this.filePreviewBody.appendChild(sheetEl);
            } catch (err) {
                console.error(err);
                this.filePreviewBody.innerHTML = '<p style="color: var(--danger); padding: 2rem; text-align: center;">Error al procesar la hoja de cálculo de Excel.</p>';
            }
        } else if (group === 'powerpoint') {
            this.filePreviewBody.innerHTML = `
                <div style="text-align: center; color: var(--text-primary); padding: 3rem; display: flex; flex-direction: column; align-items: center; gap: 15px; width: 100%;">
                    <div style="font-size: 4rem; animation: floatIcon 3s ease-in-out infinite;">📙</div>
                    <h3 style="font-size: 1.25rem;">Presentación PowerPoint: ${file.name}</h3>
                    <p style="color: var(--text-secondary); max-width: 450px; font-size: 0.9rem;">Las presentaciones de PowerPoint (.pptx) no se pueden previsualizar de forma interactiva en la web directamente sin servicios externos. Descárgala para abrirla en tu equipo.</p>
                    <button class="btn btn-primary" onclick="app.downloadFile(${file.id})">Descargar Presentación 📥</button>
                </div>
            `;
        }

        const downloadBtn = document.getElementById('btnDownloadPreviewFile');
        if (downloadBtn) {
            downloadBtn.onclick = () => this.downloadFile(id);
        }

        this.openModal(this.modalFilePreview);
    }

    deleteFile(id) {
        const file = this.files.find(f => f.id === id);
        if (file) {
            if (confirm(`¿Estás seguro de eliminar el archivo "${file.name}"?`)) {
                this.files = this.files.filter(f => f.id !== id);
                this.saveAndRefresh();
                this.showToast('Archivo eliminado');
            }
        }
    }

    toggleNote(c) { c.classList.toggle('expanded'); }

    handleDependencyTypeChange(v) {
        if (this.taskDependencyAreaContainer) {
            this.taskDependencyAreaContainer.style.display = v === 'area' ? 'block' : 'none';
        }
    }

    // --- RECURRENCE UI ---
    handleRecurrenceChange(v) {
        if (v === 'custom') {
            this.openRecurrenceModal();
        } else {
            this.currentCustomRecurrence = null;
        }

        this.updateCustomRecurrenceBadge();

        if (v === 'weekly') {
            this.taskWeeklyDaysContainer.style.display = 'block';
            if (this.taskStart.value && this.taskWeeklyDaysContainer.querySelectorAll('.day-btn.active').length === 0) {
                const day = new Date(this.taskStart.value).getDay();
                this.taskWeeklyDaysContainer.querySelector(`.day-btn[data-day="${day}"]`)?.classList.add('active');
            }
        } else {
            this.taskWeeklyDaysContainer.style.display = 'none';
        }

        this.taskMonthlyContainer.style.display = v === 'monthly' ? 'block' : 'none';
        this.taskYearlyContainer.style.display = v === 'yearly' ? 'block' : 'none';

        if (v === 'monthly' && this.taskStart.value && !this.editingTaskId) {
            this.taskMonthDay.value = new Date(this.taskStart.value).getDate();
        }
        if (v === 'yearly' && this.taskStart.value && !this.editingTaskId) {
            const d = new Date(this.taskStart.value);
            this.taskYearDay.value = d.getDate();
            this.taskYearMonth.value = d.getMonth();
        }
    }

    updateCustomRecurrenceBadge() {
        const container = document.getElementById('customRecurrenceBadgeContainer');
        const textEl = document.getElementById('customRecurrenceBadgeText');
        if (!container || !textEl) return;

        if (this.taskRecurrence.value === 'custom' && this.currentCustomRecurrence) {
            const rec = this.currentCustomRecurrence;
            let summary = '';
            if (rec.type === 'week') {
                const dayMap = { 0: 'D', 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V', 6: 'S' };
                const daysStr = (rec.weekDays || []).map(d => dayMap[d]).filter(Boolean).join(', ');
                summary = `🔁 Cada ${rec.interval > 1 ? rec.interval + ' semanas' : 'semana'} los ${daysStr || 'días elegidos'}`;
            } else if (rec.type === 'day') {
                summary = `🔁 Cada ${rec.interval > 1 ? rec.interval + ' días' : 'día'}`;
            } else if (rec.type === 'month') {
                summary = `🔁 Mensual (${rec.monthPat === 'day' ? 'Día ' + rec.monthDay : 'Semanal'})`;
            } else if (rec.type === 'year') {
                summary = `🔁 Anual (${rec.yearDay}/${(rec.yearMonth || 0) + 1})`;
            }
            textEl.textContent = summary || '🔁 Periodicidad configurada';
            container.style.display = 'block';
        } else {
            container.style.display = 'none';
        }
    }

    openRecurrenceModal() {
        const rec = this.currentCustomRecurrence;
        if (rec) {
            if (this.recType) this.recType.value = rec.type || 'week';
            if (this.recInterval) this.recInterval.value = rec.interval || 1;
            if (this.recStart) this.recStart.value = rec.start || (this.taskStart.value ? this.taskStart.value.split('T')[0] : new Date().toISOString().split('T')[0]);
            if (this.recEnd) this.recEnd.value = rec.end || '';

            // Restore day buttons inside modalRecurrence
            const dayBtns = this.modalRecurrence.querySelectorAll('.day-btn');
            dayBtns.forEach(btn => {
                const d = parseInt(btn.dataset.day);
                const isActive = Array.isArray(rec.weekDays) && rec.weekDays.includes(d);
                btn.classList.toggle('active', isActive);
            });

            if (rec.type === 'month') {
                if (rec.monthPat === 'day' && this.patMonthDay) this.patMonthDay.checked = true;
                else if (this.patMonthRelative) this.patMonthRelative.checked = true;
                if (this.recMonthDay) this.recMonthDay.value = rec.monthDay || 1;
                if (this.recMonthWeek) this.recMonthWeek.value = rec.monthWeek || '1';
                if (this.recMonthDayName) this.recMonthDayName.value = rec.monthDayName !== undefined ? rec.monthDayName : '1';
            }
            if (rec.type === 'year') {
                if (this.recYearDay) this.recYearDay.value = rec.yearDay || 1;
                if (this.recYearMonth) this.recYearMonth.value = rec.yearMonth !== undefined ? rec.yearMonth : 0;
            }
        } else {
            if (this.recType) this.recType.value = 'week';
            if (this.recInterval) this.recInterval.value = 1;
            const defaultDate = this.taskStart.value ? this.taskStart.value.split('T')[0] : new Date().toISOString().split('T')[0];
            if (this.recStart) this.recStart.value = defaultDate;
            if (this.recEnd) this.recEnd.value = '';

            const defaultDay = new Date(defaultDate).getDay();
            const dayBtns = this.modalRecurrence.querySelectorAll('.day-btn');
            dayBtns.forEach(btn => {
                btn.classList.toggle('active', parseInt(btn.dataset.day) === defaultDay);
            });
        }

        this.updateRecurrenceFields();
        this.updateRecurrenceSummary();
        this.openModal(this.modalRecurrence);
    }

    updateRecurrenceFields() { 
        const t = this.recType.value; 
        this.sectionWeekly.style.display = t === 'week' ? 'block' : 'none'; 
        this.sectionMonthly.style.display = t === 'month' ? 'block' : 'none'; 
        this.sectionYearly.style.display = t === 'year' ? 'block' : 'none'; 
        this.updateRecurrenceSummary(); 
    }

    updateRecurrenceSummary() {
        const t = this.recType.value, i = parseInt(this.recInterval.value) || 1, st = this.recStart.value; 
        let s = `Se produce cada ${i > 1 ? i : ''} `;
        if (t === 'day') {
            s += i > 1 ? 'días' : 'día';
        } else if (t === 'week') { 
            const ds = Array.from(this.modalRecurrence.querySelectorAll('.day-btn.active')).map(b => b.textContent).join(', '); 
            s += (i > 1 ? 'semanas' : 'semana') + (ds ? ` los ${ds}` : ''); 
        } else if (t === 'month') { 
            s += i > 1 ? 'meses' : 'mes'; 
            if (this.patMonthDay && this.patMonthDay.checked) {
                s += ` el día ${this.recMonthDay.value}`; 
            } else if (this.recMonthWeek && this.recMonthDayName) {
                s += ` el ${this.recMonthWeek.options[this.recMonthWeek.selectedIndex].text} ${this.recMonthDayName.options[this.recMonthDayName.selectedIndex].text}`; 
            }
        } else {
            s += (i > 1 ? 'años' : 'año') + ` el ${this.recYearDay.value} de ${this.recYearMonth.options[this.recYearMonth.selectedIndex].text}`;
        }
        if (st) s += ` empezando el ${new Date(st + 'T00:00:00').toLocaleDateString()}`;
        if (this.recSummaryText) this.recSummaryText.textContent = s;
        return s;
    }

    saveRecurrenceUI() {
        const weekBtns = Array.from(this.modalRecurrence.querySelectorAll('.day-btn.active'));
        let weekDays = weekBtns.map(b => parseInt(b.dataset.day));
        
        if (this.recType.value === 'week' && weekDays.length === 0) {
            const defaultDay = this.recStart.value ? new Date(this.recStart.value + 'T00:00:00').getDay() : 1;
            weekDays = [defaultDay];
        }

        this.currentCustomRecurrence = { 
            type: this.recType.value, 
            interval: parseInt(this.recInterval.value) || 1, 
            start: this.recStart.value, 
            end: this.recEnd.value, 
            weekDays: weekDays, 
            monthPat: this.patMonthDay && this.patMonthDay.checked ? 'day' : 'relative', 
            monthDay: parseInt(this.recMonthDay ? this.recMonthDay.value : 1), 
            monthWeek: this.recMonthWeek ? this.recMonthWeek.value : '1', 
            monthDayName: parseInt(this.recMonthDayName ? this.recMonthDayName.value : 1), 
            yearDay: parseInt(this.recYearDay ? this.recYearDay.value : 1), 
            yearMonth: parseInt(this.recYearMonth ? this.recYearMonth.value : 0) 
        };

        if (this.recStart.value && (!this.taskStart.value || !this.taskStart.value.includes('T'))) {
            const timePart = (this.taskStart.value && this.taskStart.value.includes('T')) ? this.taskStart.value.split('T')[1] : '09:00';
            this.taskStart.value = `${this.recStart.value}T${timePart}`;
            if (!this.taskEnd.value) {
                this.taskEnd.value = `${this.recStart.value}T10:00`;
            }
        }

        this.updateCustomRecurrenceBadge();
        this.modalRecurrence.style.display = 'none'; 
        this.showToast('Periodicidad guardada');
    }

    closeRecurrenceModal() {
        if (this.modalRecurrence) this.modalRecurrence.style.display = 'none';
        if (this.taskRecurrence && this.taskRecurrence.value === 'custom' && !this.currentCustomRecurrence) {
            this.taskRecurrence.value = 'none';
            this.updateCustomRecurrenceBadge();
        }
    }

    // --- MASTER PASSWORD & CRYPTO ---
    encryptData(text) {
        if (!text || !this.vaultUnlocked || !this.masterKey) return text;
        try { return CryptoJS.AES.encrypt(text, this.masterKey).toString(); } catch(e) { return text; }
    }
    decryptData(cipherText) {
        if (!cipherText || !this.vaultUnlocked || !this.masterKey) return cipherText;
        if (!cipherText.startsWith('U2FsdGVkX1')) return cipherText;
        try {
            const bytes = CryptoJS.AES.decrypt(cipherText, this.masterKey);
            const decrypted = bytes.toString(CryptoJS.enc.Utf8);
            return decrypted || cipherText;
        } catch(e) {
            return cipherText;
        }
    }
    toggleVaultLock() {
        if (this.vaultUnlocked) {
            this.vaultUnlocked = false;
            this.masterKey = null;
            if (this.btnUnlockVault) {
                this.btnUnlockVault.style.color = 'var(--danger)';
                this.btnUnlockVault.textContent = '🔒';
            }
            this.showToast('Bóvedas bloqueadas');
            this.renderAll();
        } else {
            this.openMasterPasswordModal();
        }
    }
    openMasterPasswordModal() {
        const hasKey = localStorage.getItem('tm_vault_validation');
        if (hasKey) {
            if (this.masterPasswordTitle) this.masterPasswordTitle.textContent = 'Desbloquear Bóvedas';
            if (this.masterPasswordDesc) this.masterPasswordDesc.textContent = 'Ingresa tu contraseña maestra para descifrar.';
            if (this.btnSubmitMasterPassword) this.btnSubmitMasterPassword.textContent = 'Desbloquear';
        } else {
            if (this.masterPasswordTitle) this.masterPasswordTitle.textContent = 'Configurar Bóvedas';
            if (this.masterPasswordDesc) this.masterPasswordDesc.textContent = 'Crea una contraseña maestra. ¡No la olvides!';
            if (this.btnSubmitMasterPassword) this.btnSubmitMasterPassword.textContent = 'Configurar y Cifrar';
        }
        if (this.inputMasterPassword) this.inputMasterPassword.value = '';
        this.openModal(this.modalMasterPassword);
        setTimeout(() => { if (this.inputMasterPassword) this.inputMasterPassword.focus(); }, 100);
    }
    submitMasterPassword() {
        const pass = this.inputMasterPassword ? this.inputMasterPassword.value : '';
        if (!pass) return;
        const validationStr = localStorage.getItem('tm_vault_validation');
        if (validationStr) {
            try {
                const bytes = CryptoJS.AES.decrypt(validationStr, pass);
                const decrypted = bytes.toString(CryptoJS.enc.Utf8);
                if (decrypted === 'taskmaster_valid') {
                    this.masterKey = pass;
                    this.vaultUnlocked = true;
                    if (this.btnUnlockVault) {
                        this.btnUnlockVault.style.color = 'var(--success)';
                        this.btnUnlockVault.textContent = '🔓';
                    }
                    this.closeAllModals();
                    this.showToast('Bóvedas desbloqueadas');
                    this.renderAll();
                } else {
                    this.showToast('Contraseña incorrecta', 3000);
                }
            } catch(e) {
                this.showToast('Contraseña incorrecta', 3000);
            }
        } else {
            this.masterKey = pass;
            this.vaultUnlocked = true;
            const encryptedVal = CryptoJS.AES.encrypt('taskmaster_valid', pass).toString();
            localStorage.setItem('tm_vault_validation', encryptedVal);
            
            this.passwords.forEach(p => {
                if (p.pass && !p.pass.startsWith('U2FsdGVkX1')) p.pass = this.encryptData(p.pass);
            });
            this.servers.forEach(s => {
                if (s.currentPass && !s.currentPass.startsWith('U2FsdGVkX1')) s.currentPass = this.encryptData(s.currentPass);
                if (s.prevPass && !s.prevPass.startsWith('U2FsdGVkX1')) s.prevPass = this.encryptData(s.prevPass);
            });
            
            this.saveAndRefresh();
            if (this.btnUnlockVault) {
                this.btnUnlockVault.style.color = 'var(--success)';
                this.btnUnlockVault.textContent = '🔓';
            }
            this.closeAllModals();
            this.showToast('Contraseña maestra configurada. Bóvedas cifradas.');
        }
    }

    // --- DATA ---
    async saveAndRefresh() { 
        await this.saveToIndexedDB();
        
        // Also save to localStorage as a lightweight backup
        localStorage.setItem('tm_tasks', JSON.stringify(this.tasks)); 
        localStorage.setItem('tm_notes', JSON.stringify(this.notes)); 
        localStorage.setItem('tm_servers', JSON.stringify(this.servers));
        localStorage.setItem('tm_categories', JSON.stringify(this.categories)); 
        localStorage.setItem('tm_pendientes', JSON.stringify(this.pendientes));
        localStorage.setItem('tm_trash', JSON.stringify(this.trash));
        localStorage.setItem('tm_directory', JSON.stringify(this.directory));
        localStorage.setItem('tm_files', JSON.stringify(this.files));
        localStorage.setItem('tm_passwords', JSON.stringify(this.passwords));
        localStorage.setItem('tm_theme', this.theme);
        localStorage.setItem('tm_active_tab', this.activeTab);
        localStorage.setItem('tm_last_backup', Date.now());

        this.renderAll(); 
        this.updateStorageStatus();
        this.syncToDatabaseDebounced();
    }

    syncToDatabaseDebounced() {
        if (this.isPreviewMode || this.isOffline) return;
        if (this._syncTimer) clearTimeout(this._syncTimer);
        this._syncTimer = setTimeout(() => {
            this.syncToDatabase();
        }, 600);
    }

    async syncToDatabase() {
        if (this.isPreviewMode || this.isOffline) return;
        try {
            const body = JSON.stringify({
                tasks: this.tasks,
                notes: this.notes,
                servers: this.servers,
                agenda: this.agendaDrafts,
                categories: this.categories,
                pendientes: this.pendientes,
                trash: this.trash,
                directory: this.directory,
                files: this.files,
                passwords: this.passwords,
                isAutoSync: true
            });
            await fetch('/api/data', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                keepalive: true,
                body
            });
        } catch (e) {
            console.warn("Auto-sync to database deferred:", e);
        }
    }

    async saveToIndexedDB() {
        const data = {
            tasks: this.tasks,
            notes: this.notes,
            servers: this.servers,
            categories: this.categories,
            agendaDrafts: this.agendaDrafts,
            pendientes: this.pendientes,
            trash: this.trash,
            directory: this.directory,
            files: this.files,
            passwords: this.passwords,
            theme: this.theme,
            activeTab: this.activeTab,
            lastSave: Date.now()
        };
        try {
            await this.storage.save('allData', data);
        } catch (e) {
            console.error("IndexedDB save failed:", e);
        }
    }

    async manualReconnectDB() {
        try {
            this.showToast('🔄 Intentando conectar con la base de datos Oracle...');
            const response = await fetch('/api/reconnect', { method: 'POST' });
            if (response.ok) {
                const data = await response.json();
                if (data.connected) {
                    this.isOffline = false;
                    this.showToast('✅ ¡Conexión con Oracle DB restablecida!');
                    await this.loadAllData();
                    this.renderAll();
                    this.updateStorageStatus();
                    return true;
                } else {
                    const errDetail = (data.lastError && data.lastError.message) ? data.lastError.message : 'BD offline';
                    this.showToast(`❌ No se pudo conectar a Oracle DB: ${errDetail}`);
                    console.warn("DB Reconnect attempt failed:", data);
                    return false;
                }
            } else {
                this.showToast('❌ El servidor backend está offline o no responde.');
                return false;
            }
        } catch (e) {
            this.showToast('❌ El servidor backend no responde (offline).');
            return false;
        }
    }

    async saveVersionToDB() {
        if (this.isOffline) {
            this.showToast('⚠️ Modo Offline activo. Intentando reconectar a la BD...');
            const reconnected = await this.manualReconnectDB();
            if (!reconnected) return;
        }
        if (this.isPreviewMode) {
            this.showToast('⚠️ No puedes guardar versiones mientras previsualizas una antigua');
            return;
        }

        try {
            this.showToast('Guardando versión en la base de datos...');
            const response = await fetch('/api/data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tasks: this.tasks,
                    notes: this.notes,
                    servers: this.servers,
                    agenda: this.agendaDrafts,
                    categories: this.categories,
                    pendientes: this.pendientes,
                    trash: this.trash,
                    directory: this.directory,
                    files: this.files,
                    passwords: this.passwords
                })
            });
            if (response.ok) {
                const resData = await response.json();
                if (resData.versionId) {
                    this.currentVersionId = resData.versionId;
                }
                this.showToast('Versión guardada con éxito en Oracle DB');
                if (this.activeTab === 'tabVersions') {
                    this.loadVersionsList();
                }
            } else {
                this.showToast('Error al guardar versión en el servidor');
                console.error("Failed to save to Oracle DB backend");
            }
        } catch (err) {
            this.showToast('Error de red al guardar en backend');
            console.error("Network error when saving to backend:", err);
        }
    }

    updateStorageStatus() {
        const statusEl = document.getElementById('storageStatus');
        if (statusEl) {
            if (this.isOffline) {
                statusEl.innerHTML = `
                    <span class="teams-btn-icon" style="color: var(--warning);">⚠️</span>
                    <span class="teams-btn-label" style="color: var(--warning);">Offline (Reconectar)</span>
                `;
                statusEl.classList.remove('secure');
                statusEl.style.cursor = 'pointer';
                statusEl.title = 'Modo Offline (Base de datos desconectada). Haz clic para reintentar conexión con Oracle DB.';
            } else {
                statusEl.innerHTML = `
                    <span class="teams-btn-icon" style="color: var(--success);">💾</span>
                    <span class="teams-btn-label" style="color: var(--success);">Conectado</span>
                `;
                statusEl.classList.add('secure');
                statusEl.style.cursor = 'default';
                statusEl.title = 'Conectado exitosamente a Oracle Database';
            }
        }

        // Check for manual backup reminder (every 7 days)
        const lastManualBackup = localStorage.getItem('tm_last_manual_export');
        if (!lastManualBackup || (Date.now() - parseInt(lastManualBackup) > 7 * 24 * 60 * 60 * 1000)) {
            this.showBackupReminder();
        }
    }

    submitBulkImport() {
        if (!this.bulkImportTextarea || !this.bulkImportTextarea.value.trim()) return;
        
        const text = this.bulkImportTextarea.value;
        const newTasks = this.parseHierarchicalText(text);
        
        if (newTasks.length > 0) {
            this.tasks.push(...newTasks);
            this.saveAndRefresh();
            this.bulkImportTextarea.value = '';
            this.bulkImportArea.style.display = 'none';
            this.showToast(`${newTasks.length} actividades estructuradas cargadas`);
        }
    }

    parseHierarchicalText(text) {
        const lines = text.split('\n');
        const stack = [];
        const parsedTasks = [];
        
        lines.forEach(line => {
            if (!line.trim()) return;
            
            const leadingWhitespace = line.match(/^([ \t]*)/)[0];
            const spaceCount = leadingWhitespace.replace(/\t/g, '    ').length;
            const depth = Math.floor(spaceCount / 2);
            
            const title = line.trim();
            const taskId = Date.now() + Math.floor(Math.random() * 100000);
            
            while (stack.length > depth) {
                stack.pop();
            }
            
            const parentId = stack.length > 0 ? stack[stack.length - 1] : null;
            
            parsedTasks.push({
                id: taskId,
                title: title,
                priority: 'media',
                category: 'Generales',
                start: '',
                end: '',
                recurrence: 'none',
                completed: false,
                lastCompletedDate: null,
                status: 'todo',
                parentId: parentId,
                dependencyType: 'me',
                dependencyArea: ''
            });
            
            stack.push(taskId);
        });
        
        return parsedTasks;
    }

    clearHierarchicalTasks() {
        if (confirm('¿Estás seguro de que deseas eliminar TODAS las actividades? Esta acción borrará todas las tareas de la lista.')) {
            this.tasks = [];
            this.saveAndRefresh();
            this.showToast('Todas las actividades eliminadas');
        }
    }

    toggleHierarchicalCompletion(id) {
        const t = this.tasks.find(tk => tk.id === id);
        if (!t) return;
        
        const s = new Date().toLocaleDateString('sv-SE');
        const currentlyCompleted = this.isTaskCompletedToday(t, s) || (t.completed && (!t.recurrence || t.recurrence === 'none'));
        const targetState = !currentlyCompleted;
        
        const setCompletionStateRecursive = (taskId, state) => {
            const task = this.tasks.find(tk => tk.id === taskId);
            if (task) {
                task.completed = state;
                if (state) {
                    task.lastCompletedDate = s;
                } else {
                    task.lastCompletedDate = null;
                }
            }
            this.tasks.forEach(tk => {
                if (tk.parentId === taskId) {
                    setCompletionStateRecursive(tk.id, state);
                }
            });
        };
        
        setCompletionStateRecursive(id, targetState);
        this.saveAndRefresh();
    }

    addHierarchicalSubtask(parentId) {
        const title = prompt("Escribe el nombre de la subtarea:");
        if (!title || !title.trim()) return;
        
        const newTask = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            title: title.trim(),
            priority: 'media',
            category: 'Generales',
            start: '',
            end: '',
            recurrence: 'none',
            completed: false,
            lastCompletedDate: null,
            status: 'todo',
            parentId: parentId,
            dependencyType: 'me',
            dependencyArea: ''
        };
        
        this.tasks.push(newTask);
        this.saveAndRefresh();
        this.showToast('Subtarea añadida');
    }

    editHierarchicalTaskInline(id) {
        const t = this.tasks.find(tk => tk.id === id);
        if (!t) return;
        const newTitle = prompt("Editar nombre de la actividad:", t.title);
        if (newTitle !== null && newTitle.trim()) {
            t.title = newTitle.trim();
            this.saveAndRefresh();
        }
    }

    renderHierarchicalTasks() {
        if (!this.hierarchicalTree) return;
        
        const today = new Date();
        const sDate = today.toLocaleDateString('sv-SE');
        
        const parentMap = {};
        this.tasks.forEach(t => {
            if (t.completed && (!t.recurrence || t.recurrence === 'none') && t.lastCompletedDate && t.lastCompletedDate !== sDate) {
                return;
            }
            const pId = t.parentId || 'root';
            if (!parentMap[pId]) parentMap[pId] = [];
            const comp = this.isTaskCompletedToday(t, sDate);
            parentMap[pId].push({ ...t, completed: comp });
        });
        
        const renderNode = (node, level) => {
            let html = '';
            const checkIcon = node.completed ? 
                `<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>` : 
                `<svg viewBox="0 0 24 24" style="opacity: 0;"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
                
            let depHtml = '';
            if (node.dependencyType === 'me') {
                depHtml = `<span class="dep-badge dep-me" style="font-size: 0.65rem; padding: 1px 4px;">🙋 Mío</span>`;
            } else if (node.dependencyType === 'area') {
                depHtml = `<span class="dep-badge dep-area" style="font-size: 0.65rem; padding: 1px 4px;">🏢 ${node.dependencyArea || 'Área'}</span>`;
            }

            html += `
                <div class="tree-item-row" data-id="${node.id}" style="margin-left: ${level * 24}px;">
                    <div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; flex-wrap: wrap;">
                        <button class="tree-checkbox ${node.completed ? 'completed' : ''}" onclick="app.toggleHierarchicalCompletion(${node.id})" title="Marcar completado">
                            ${checkIcon}
                        </button>
                        <span class="tree-title ${node.completed ? 'completed' : ''}" onclick="app.editHierarchicalTaskInline(${node.id})" title="Editar título">${node.title}</span>
                        ${depHtml}
                    </div>
                    <div class="tree-actions">
                        <button class="btn-icon" onclick="app.addHierarchicalSubtask(${node.id})" title="Añadir Subtarea">➕</button>
                        <button class="btn-icon" onclick="app.editTask(${node.id})" title="Editar Detalles">✏️</button>
                        <button class="btn-icon" onclick="app.deleteTask(${node.id})" title="Eliminar">🗑️</button>
                    </div>
                </div>
            `;
            
            const children = parentMap[node.id] || [];
            children.forEach(child => {
                html += renderNode(child, level + 1);
            });
            
            return html;
        };
        
        let finalHtml = '';
        const rootNodes = parentMap['root'] || [];
        if (rootNodes.length === 0) {
            finalHtml = `<div class="empty-state" style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                <p>No hay actividades registradas.</p>
                <button class="btn btn-primary btn-small" onclick="document.getElementById('bulkImportArea').style.display = 'block';">⚡ Captura en Bloque</button>
            </div>`;
        } else {
            rootNodes.forEach(node => {
                finalHtml += renderNode(node, 0);
            });
        }
        
        this.hierarchicalTree.innerHTML = finalHtml;
    }

    copyHierarchicalText() {
        const today = new Date();
        const sDate = today.toLocaleDateString('sv-SE');
        
        const parentMap = {};
        this.tasks.forEach(t => {
            if (t.completed && (!t.recurrence || t.recurrence === 'none') && t.lastCompletedDate && t.lastCompletedDate !== sDate) {
                return;
            }
            const pId = t.parentId || 'root';
            if (!parentMap[pId]) parentMap[pId] = [];
            const comp = this.isTaskCompletedToday(t, sDate);
            parentMap[pId].push({ ...t, completed: comp });
        });

        const buildTextTree = (nodeId, level) => {
            let txt = '';
            const nodes = parentMap[nodeId] || [];
            nodes.forEach(node => {
                const indent = '  '.repeat(level);
                const statusChar = node.completed ? '[x]' : '[ ]';
                let depSuffix = '';
                if (node.dependencyType === 'me') {
                    depSuffix = ' (Depende de mí)';
                } else if (node.dependencyType === 'area') {
                    depSuffix = ` (Depende de: ${node.dependencyArea || 'Otra área'})`;
                }
                txt += `${indent}${statusChar} ${node.title}${depSuffix}\n`;
                txt += buildTextTree(node.id, level + 1);
            });
            return txt;
        };

        const treeText = buildTextTree('root', 0);
        if (!treeText.trim()) {
            this.showToast('No hay actividades activas para copiar');
            return;
        }

        const headerText = `Lista Jerárquica de Actividades - ${today.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}\n\n`;
        const finalText = headerText + treeText;

        navigator.clipboard.writeText(finalText).then(() => {
            this.showToast('Lista jerárquica copiada como texto al portapapeles');
        }).catch(err => {
            console.error('Error al copiar texto jerárquico:', err);
            this.showToast('Error al copiar texto');
        });
    }

    exportHierarchicalImage() {
        if (!this.hierarchicalTree) return;
        
        const today = new Date();
        const sDate = today.toLocaleDateString('sv-SE');
        const activeTasks = this.tasks.filter(t => {
            if (t.completed && (!t.recurrence || t.recurrence === 'none') && t.lastCompletedDate && t.lastCompletedDate !== sDate) {
                return false;
            }
            return true;
        });

        if (activeTasks.length === 0) {
            this.showToast('No hay actividades para exportar');
            return;
        }

        if (typeof window.html2canvas === 'undefined') {
            this.showToast('⚠️ La librería de captura no está cargada. Por favor recarga la página o revisa tu conexión.');
            return;
        }

        this.showToast('Generando imagen de la lista jerárquica...');

        const currentBgColor = getComputedStyle(document.body).getPropertyValue('--bg-color') || '#0f172a';

        window.html2canvas(this.hierarchicalTree, {
            useCORS: true,
            allowTaint: true,
            backgroundColor: currentBgColor.trim(),
            scale: 2
        }).then(canvas => {
            const dataUrl = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = `lista_jerarquica_${new Date().toISOString().split('T')[0]}.png`;
            link.href = dataUrl;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            this.showToast('Imagen PNG descargada con éxito');
        }).catch(err => {
            console.error('Error rendering hierarchical tree with html2canvas:', err);
            this.showToast('Error al exportar imagen');
        });
    }

    showBackupReminder() {
        if (document.getElementById('backupReminder')) return;
        this.showToast('⚠️ Recuerda exportar tu backup semanal para mayor seguridad.', 10000);
    }

    saveQuickTask() {
        if (!this.quickTaskInput || !this.quickTaskInput.value.trim()) return;
        
        const nt = {
            id: Date.now(),
            title: this.quickTaskInput.value.trim(),
            priority: 'media',
            category: 'Generales',
            start: '',
            end: '',
            recurrence: 'none',
            completed: false,
            lastCompletedDate: null,
            status: 'todo', // directly to "Por Hacer Hoy"
            dependencyType: 'me',
            dependencyArea: ''
        };
        
        this.tasks.push(nt);
        this.quickTaskInput.value = '';
        this.saveAndRefresh();
        this.showToast('Tarea rápida añadida');
    }

    saveTask() {
        let recurrence = this.taskRecurrence.value === 'custom' ? this.currentCustomRecurrence : this.taskRecurrence.value;
        if (this.taskRecurrence.value === 'custom' && !this.currentCustomRecurrence) {
            recurrence = 'none';
        }
        if (recurrence && typeof recurrence === 'object' && this.taskStart.value) {
            const taskStartDateStr = this.taskStart.value.split('T')[0];
            if (!recurrence.start || recurrence.start > taskStartDateStr) {
                recurrence.start = taskStartDateStr;
            }
        }
        let weekDays = null;
        let monthPat = null, monthDay = null, monthWeek = null, monthDayName = null;
        let yearDay = null, yearMonth = null;

        if (this.taskRecurrence.value === 'weekly') {
            weekDays = Array.from(this.taskWeeklyDaysContainer.querySelectorAll('.day-btn.active')).map(b => parseInt(b.dataset.day));
        } else if (this.taskRecurrence.value === 'monthly') {
            monthPat = this.taskPatMonthDay.checked ? 'day' : 'relative';
            monthDay = parseInt(this.taskMonthDay.value);
            monthWeek = this.taskMonthWeek.value;
            monthDayName = parseInt(this.taskMonthDayName.value);
        } else if (this.taskRecurrence.value === 'yearly') {
            yearDay = parseInt(this.taskYearDay.value);
            yearMonth = parseInt(this.taskYearMonth.value);
        }

        const nt = {
            id: this.editingTaskId || Date.now(),
            title: this.taskTitle.value,
            priority: this.taskPriority.value,
            category: this.taskCategory.value,
            start: this.taskStart.value,
            end: this.taskEnd.value,
            recurrence: recurrence,
            weekDays, monthPat, monthDay, monthWeek, monthDayName, yearDay, yearMonth,
            dependencyType: this.taskDependencyType.value,
            dependencyArea: this.taskDependencyArea.value,
            completed: false,
            lastCompletedDate: null,
            status: 'backlog',
            timeline: this.currentTimeline || []
        };

        if (this.editingTaskId) {
            const idx = this.tasks.findIndex(t => t.id === this.editingTaskId);
            nt.completed = this.tasks[idx].completed;
            nt.lastCompletedDate = this.tasks[idx].lastCompletedDate;
            nt.status = this.tasks[idx].status;
            this.tasks[idx] = nt;
            this.editingTaskId = null;
        } else {
            this.tasks.push(nt);
        }

        this.saveAndRefresh();
        this.closeAllModals();
        this.taskForm.reset();
        this.currentCustomRecurrence = null;
        this.updateCustomRecurrenceBadge();
        this.taskWeeklyDaysContainer.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
        this.taskWeeklyDaysContainer.style.display = 'none';
        this.taskMonthlyContainer.style.display = 'none';
        this.taskYearlyContainer.style.display = 'none';
    }
    editTask(id) {
        const t = this.tasks.find(tk => tk.id === id);
        if (t) {
            this.editingTaskId = id;
            this.currentTimeline = [...(t.timeline || [])];
            this.renderTaskTimeline();
            this.taskTitle.value = t.title;
            this.taskPriority.value = t.priority || 'media';
            this.taskCategory.value = t.category || '';
            this.taskStart.value = t.start || '';
            this.taskEnd.value = t.end || '';

            if (typeof t.recurrence === 'object' && t.recurrence !== null) {
                this.taskRecurrence.value = 'custom';
                this.currentCustomRecurrence = { ...t.recurrence };
            } else {
                this.taskRecurrence.value = t.recurrence || 'none';
                this.currentCustomRecurrence = null;
            }
            this.updateCustomRecurrenceBadge();

            // Handle weekly days UI
            this.taskWeeklyDaysContainer.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
            this.taskWeeklyDaysContainer.style.display = this.taskRecurrence.value === 'weekly' ? 'block' : 'none';
            if (this.taskRecurrence.value === 'weekly' && t.weekDays) {
                t.weekDays.forEach(day => {
                    this.taskWeeklyDaysContainer.querySelector(`.day-btn[data-day="${day}"]`)?.classList.add('active');
                });
            }

            // Handle Monthly UI
            this.taskMonthlyContainer.style.display = this.taskRecurrence.value === 'monthly' ? 'block' : 'none';
            if (this.taskRecurrence.value === 'monthly') {
                if (t.monthPat === 'day') this.taskPatMonthDay.checked = true;
                else if (t.monthPat === 'relative') this.taskPatMonthRelative.checked = true;
                this.taskMonthDay.value = t.monthDay || 1;
                this.taskMonthWeek.value = t.monthWeek || '1';
                this.taskMonthDayName.value = t.monthDayName !== undefined ? t.monthDayName : '1';
            }

            // Handle Yearly UI
            this.taskYearlyContainer.style.display = this.taskRecurrence.value === 'yearly' ? 'block' : 'none';
            if (this.taskRecurrence.value === 'yearly') {
                this.taskYearDay.value = t.yearDay || 1;
                this.taskYearMonth.value = t.yearMonth !== undefined ? t.yearMonth : 0;
            }

            // Handle Dependency UI
            this.taskDependencyType.value = t.dependencyType || 'me';
            this.taskDependencyArea.value = t.dependencyArea || '';
            this.taskDependencyAreaContainer.style.display = this.taskDependencyType.value === 'area' ? 'block' : 'none';

            this.openModal(this.modalTask);
        }
    }
    deleteTask(id) {
        const t = this.tasks.find(tk => tk.id === id);
        if (t) {
            this.moveToTrash(t, 'task');
            this.tasks = this.tasks.filter(tk => tk.id !== id);
            this.saveAndRefresh();
            this.syncToDatabase();
        }
    }
    saveNote() {
        const text = this.noteText.value.trim();
        const date = this.noteDate.value;
        const importance = parseInt(this.noteImportance.value);
        if (!text) return;
        if (this.editingNoteId) {
            const n = this.notes.find(nt => nt.id === this.editingNoteId);
            n.text = text;
            n.color = this.selectedNoteColor;
            n.date = date;
            n.importance = importance;
            this.editingNoteId = null;
        } else {
            this.notes.unshift({ id: Date.now(), text, color: this.selectedNoteColor, date, importance });
        }
        this.saveAndRefresh();
        this.closeAllModals();
        this.noteForm.reset();
    }
    editNote(id) {
        const n = this.notes.find(nt => nt.id === id);
        if (n) {
            this.editingNoteId = id;
            this.noteText.value = n.text;
            this.noteDate.value = n.date || '';
            this.noteImportance.value = n.importance || 2;
            this.selectedNoteColor = n.color;
            this.colorBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.color === n.color));
            this.openModal(this.modalNote);
        }
    }
    deleteNote(id) {
        const n = this.notes.find(nt => nt.id === id);
        if (n) {
            this.moveToTrash(n, 'note');
            this.notes = this.notes.filter(nt => nt.id !== id);
            this.saveAndRefresh();
        }
    }

    // --- OTHER ---
    initDragAndDrop() {
        // Tasks D&D
        [this.itemsBacklog, this.itemsTodo, this.agendaGrid].forEach(c => {
            c.addEventListener('dragover', (e) => { e.preventDefault(); e.target.closest('.bucket-items, .agenda-slot')?.classList.add('drag-over'); });
            c.addEventListener('dragleave', (e) => e.target.closest('.bucket-items, .agenda-slot')?.classList.remove('drag-over'));
            c.addEventListener('drop', (e) => {
                e.preventDefault();
                const id = parseInt(e.dataTransfer.getData('taskId'));
                const t = this.tasks.find(tk => tk.id === id);
                if (!t) return;
                const b = e.target.closest('.bucket-items'), s = e.target.closest('.agenda-slot');
                if (b) {
                    t.status = b.dataset.status;
                    this.saveAndRefresh();
                } else if (s) {
                    const target = new Date(this.currentAgendaDate).toLocaleDateString('sv-SE');
                    t.start = `${target}T${s.dataset.hour}`;
                    t.status = 'todo';
                    this.saveAndRefresh();
                }
            });
        });

        // Notes Kanban D&D
        const placeholder = document.createElement('div');
        placeholder.className = 'note-placeholder';

        Object.values(this.noteImportanceContainers).forEach(container => {
            container.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (!this.draggingNoteId) return;
                container.classList.add('drag-over');

                const targetCard = e.target.closest('.note-card');
                if (targetCard) {
                    const rect = targetCard.getBoundingClientRect();
                    const next = (e.clientY - rect.top) > (rect.height / 2);
                    container.insertBefore(placeholder, next ? targetCard.nextSibling : targetCard);
                } else if (container.querySelectorAll('.note-card').length === 0) {
                    container.appendChild(placeholder);
                }
            });

            container.addEventListener('dragleave', (e) => {
                container.classList.remove('drag-over');
            });

            container.addEventListener('drop', (e) => {
                e.preventDefault();
                container.classList.remove('drag-over');
                if (!this.draggingNoteId) return;

                const draggingId = parseInt(this.draggingNoteId);
                const note = this.notes.find(n => n.id === draggingId);
                if (!note) return;

                // Update importance based on column
                const column = e.target.closest('.notes-column');
                if (column) {
                    note.importance = parseInt(column.dataset.importance);
                }

                // Reorder in array: remove and re-insert at the top
                const draggingIndex = this.notes.indexOf(note);
                if (draggingIndex > -1) {
                    this.notes.splice(draggingIndex, 1);
                    this.notes.unshift(note);
                }

                this.saveAndRefresh();
                this.draggingNoteId = null;
                placeholder.remove();
            });
        });

        document.addEventListener('dragend', (e) => {
            placeholder.remove();
            this.draggingNoteId = null;
            document.querySelectorAll('.note-card.dragging').forEach(c => c.classList.remove('dragging'));
        });
    }
    handleDragStart(e) {
        const taskId = e.target.dataset.id || e.target.closest('.agenda-event, .task-card')?.dataset.id;
        if (taskId) e.dataTransfer.setData('taskId', taskId);

        const card = e.target.closest('.note-card');
        if (card) {
            this.draggingNoteId = card.dataset.id;
            e.dataTransfer.setData('noteId', this.draggingNoteId);
            setTimeout(() => card.classList.add('dragging'), 0);
        }
    }
    openTaskModal() {
        this.editingTaskId = null;
        this.currentCustomRecurrence = null;
        this.updateCustomRecurrenceBadge();
        this.currentTimeline = [];
        this.renderTaskTimeline();
        this.taskForm.reset();
        this.taskWeeklyDaysContainer.style.display = 'none';
        this.taskMonthlyContainer.style.display = 'none';
        this.taskYearlyContainer.style.display = 'none';
        if (this.taskDependencyType) this.taskDependencyType.value = 'me';
        if (this.taskDependencyArea) this.taskDependencyArea.value = '';
        if (this.taskDependencyAreaContainer) this.taskDependencyAreaContainer.style.display = 'none';
        this.openModal(this.modalTask);
    }
    
    addTimelineEntry() {
        if (!this.taskTimelineInput || !this.taskTimelineList) return;
        const text = this.taskTimelineInput.value.trim();
        if (!text) return;

        if (!this.currentTimeline) this.currentTimeline = [];
        
        const now = new Date();
        const dateStr = now.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) + ' ' + now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        
        this.currentTimeline.push({
            id: Date.now(),
            text: text,
            date: dateStr,
            rawDate: now.toISOString()
        });

        this.taskTimelineInput.value = '';
        this.renderTaskTimeline();
    }

    removeTimelineEntry(index) {
        if (!this.currentTimeline) return;
        this.currentTimeline.splice(index, 1);
        this.renderTaskTimeline();
    }

    renderTaskTimeline() {
        if (!this.taskTimelineList) return;
        if (!this.currentTimeline || this.currentTimeline.length === 0) {
            this.taskTimelineList.innerHTML = '<div style="color: var(--text-secondary); font-size: 0.85rem; font-style: italic;">Sin entradas aún. Registra el primer paso.</div>';
            return;
        }

        this.taskTimelineList.innerHTML = this.currentTimeline.map((entry, index) => `
            <div class="timeline-item">
                <div class="timeline-header">
                    <span class="timeline-date">${entry.date}</span>
                    <button type="button" class="btn-remove-timeline" onclick="app.removeTimelineEntry(${index})" title="Eliminar paso">✕</button>
                </div>
                <div class="timeline-text">${entry.text}</div>
            </div>
        `).join('');
        
        this.taskTimelineList.scrollTop = this.taskTimelineList.scrollHeight;
    }

    openNoteModal() {
        this.editingNoteId = null;
        this.noteForm.reset();
        this.openModal(this.modalNote);
    }
    openModal(m) { m.style.display = 'block'; }
    closeAllModals() {
        if (this.taskRecurrence && this.taskRecurrence.value === 'custom' && !this.currentCustomRecurrence) {
            this.taskRecurrence.value = 'none';
            this.updateCustomRecurrenceBadge();
        }
        [this.modalTask, this.modalNote, this.modalServer, this.modalPomodoro, this.modalSummary, this.modalRecurrence, this.modalContact, this.modalServerNotes, this.modalPassword, this.modalMasterPassword, document.getElementById('eventFormModal')].forEach(m => { if (m) m.style.display = 'none'; });
    }
    applyTheme() { document.body.classList.toggle('light-mode', this.theme === 'light'); }
    toggleTheme() { this.theme = this.theme === 'dark' ? 'light' : 'dark'; localStorage.setItem('tm_theme', this.theme); this.applyTheme(); }
    updateCategorySelect() { if (this.taskCategory) this.taskCategory.innerHTML = this.categories.map(c => `<option value="${c}">${c}</option>`).join(''); }
    addCategory() { const n = prompt("Categoría:"); if (n && !this.categories.includes(n)) { this.categories.push(n); this.saveAndRefresh(); this.updateCategorySelect(); this.taskCategory.value = n; } }
    suggestEndTime() { if (!this.taskStart.value) return; const e = new Date(new Date(this.taskStart.value).getTime() + 3600000); this.taskEnd.value = new Date(e - e.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
    updateDateDisplay() {
        if (this.currentDateDisplay) {
            const now = new Date();
            const dateStr = now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
            const timeStr = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            this.currentDateDisplay.innerHTML = `${dateStr} <span class="clock-separator">|</span> <span class="clock-time">🕒 ${timeStr}</span>`;
        }
    }

    // --- TAB SWITCHING ---
    switchTab(tabId, save = true) {
        this.activeTab = tabId;
        if (save) localStorage.setItem('tm_active_tab', tabId);

        this.tabBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });

        this.tabPanes.forEach(pane => {
            pane.classList.toggle('active', pane.id === tabId);
        });

        // Refresh charts or specific view logic if needed
        if (tabId === 'tabAgenda') this.renderAgenda();
        if (tabId === 'tabVersions') this.loadVersionsList();
        if (tabId === 'tabCommandCenter') this.renderCommandCenter();
        if (tabId === 'tabEvents') this.renderEvents();
        if (tabId === 'tabBatRunner') this.renderBatRunner();
    }

    // --- PENDIENTES LOGIC ---
    addPendiente() {
        const text = this.pendienteInput.value.trim();
        if (!text) return;

        if (this.editingPendienteId) {
            const item = this.pendientes.find(p => p.id === this.editingPendienteId);
            if (item) item.text = text;
            this.editingPendienteId = null;
            this.btnSavePendiente.textContent = 'Guardar';
        } else {
            const now = new Date();
            const timestamp = now.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

            const newItem = {
                id: Date.now(),
                text: text,
                completed: false,
                createdAt: timestamp,
                createdAtRaw: now.getTime(),
                finishedAt: null,
                finishedAtRaw: null
            };

            this.pendientes.unshift(newItem);
        }

        this.pendienteInput.value = '';
        this.saveAndRefresh();
    }

    editPendiente(id) {
        const item = this.pendientes.find(p => p.id === id);
        if (!item) return;

        this.editingPendienteId = id;
        this.pendienteInput.value = item.text;
        this.pendienteInput.focus();
        this.btnSavePendiente.textContent = 'Actualizar';
    }

    togglePendiente(id) {
        const item = this.pendientes.find(p => p.id === id);
        if (!item) return;

        item.completed = !item.completed;
        if (item.completed) {
            const now = new Date();
            item.finishedAt = now.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            item.finishedAtRaw = now.getTime();
        } else {
            item.finishedAt = null;
            item.finishedAtRaw = null;
        }

        this.saveAndRefresh();
    }

    deletePendiente(id) {
        const p = this.pendientes.find(pd => pd.id === id);
        if (p) {
            this.moveToTrash(p, 'pendiente');
            this.pendientes = this.pendientes.filter(pd => pd.id !== id);
            this.saveAndRefresh();
        }
    }

    // --- PASSWORD VAULT LOGIC ---
    openPasswordModal() {
        this.editingPasswordId = null;
        if (this.passwordForm) this.passwordForm.reset();
        const titleEl = document.getElementById('passwordModalTitle');
        if (titleEl) titleEl.textContent = 'Nueva Contraseña';

        if (this.passValue) this.passValue.type = 'password';
        document.querySelectorAll('.btn-toggle-pass').forEach(btn => {
            if(btn.dataset.target === 'passValue') btn.textContent = '👁️';
        });
        if (this.btnCancelPasswordEdit) this.btnCancelPasswordEdit.style.display = 'none';

        this.openModal(this.modalPassword);
    }

    editPassword(id) {
        if (!this.vaultUnlocked) {
            this.showToast('⚠️ Desbloquea las bóvedas primero para editar', 3000);
            return;
        }
        const p = this.passwords.find(pw => pw.id === id);
        if (p) {
            this.editingPasswordId = id;
            const titleEl = document.getElementById('passwordModalTitle');
            if (titleEl) titleEl.textContent = 'Editar Contraseña';
            
            if (this.passTitle) this.passTitle.value = p.title || '';
            if (this.passUser) this.passUser.value = p.user || '';
            if (this.passValue) this.passValue.value = this.decryptData(p.pass) || '';
            if (this.passUrl) this.passUrl.value = p.url || '';
            if (this.passNotes) this.passNotes.value = p.notes || '';
            
            if (this.passValue) this.passValue.type = 'password';
            document.querySelectorAll('.btn-toggle-pass').forEach(btn => {
                if(btn.dataset.target === 'passValue') btn.textContent = '👁️';
            });
            
            if (this.btnCancelPasswordEdit) this.btnCancelPasswordEdit.style.display = 'inline-block';
            this.openModal(this.modalPassword);
        }
    }

    savePassword() {
        const title = this.passTitle ? this.passTitle.value.trim() : '';
        const user = this.passUser ? this.passUser.value.trim() : '';
        const pass = this.passValue ? this.passValue.value : '';
        const url = this.passUrl ? this.passUrl.value.trim() : '';
        const notes = this.passNotes ? this.passNotes.value.trim() : '';

        if (!title || !pass) return;

        const np = {
            id: this.editingPasswordId || Date.now(),
            title,
            user,
            pass: this.encryptData(pass),
            url,
            notes
        };

        if (this.editingPasswordId) {
            const idx = this.passwords.findIndex(p => p.id === this.editingPasswordId);
            if (idx > -1) this.passwords[idx] = np;
            this.editingPasswordId = null;
            this.showToast('Contraseña actualizada con éxito');
        } else {
            this.passwords.push(np);
            this.showToast('Contraseña guardada con éxito');
        }

        this.saveAndRefresh();
        this.closeAllModals();
        if (this.passwordForm) this.passwordForm.reset();
        if (this.btnCancelPasswordEdit) this.btnCancelPasswordEdit.style.display = 'none';
    }

    deletePassword(id) {
        const p = this.passwords.find(pw => pw.id === id);
        if (p) {
            this.moveToTrash(p, 'password');
            this.passwords = this.passwords.filter(pw => pw.id !== id);
            this.saveAndRefresh();
            this.showToast('Contraseña movida a la papelera');
        }
    }

    renderPasswords() {
        if (!this.passwordList) return;
        
        const filtered = this.passwords.filter(p => {
            const globalTerm = (this.searchTerm || '').toLowerCase();
            const passTerm = (this.passwordSearchInput ? this.passwordSearchInput.value : '').toLowerCase();
            
            const match = (term) => {
                if (!term) return true;
                return (
                    p.title.toLowerCase().includes(term) ||
                    (p.user && p.user.toLowerCase().includes(term)) ||
                    (p.url && p.url.toLowerCase().includes(term)) ||
                    (p.notes && p.notes.toLowerCase().includes(term))
                );
            };
            return match(globalTerm) && match(passTerm);
        });

        if (filtered.length === 0) {
            this.passwordList.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem;">No se encontraron contraseñas. Haz clic en "+ Contraseña" para agregar una.</td></tr>';
            return;
        }

        this.passwordList.innerHTML = filtered.map(p => {
            const displayPass = this.vaultUnlocked ? this.decryptData(p.pass) : '[BLOQUEADO]';
            const rawDecrypted = this.vaultUnlocked ? this.decryptData(p.pass).replace(/'/g, "\\'").replace(/"/g, '&quot;') : '';
            const copyBtn = this.vaultUnlocked ? `<button class="btn-icon" onclick="app.copyText('${rawDecrypted}')" title="Copiar contraseña" style="font-size: 0.8rem; opacity: 0.7;">📋</button>` : '';

            return `
                <tr>
                    <td style="font-weight: 500;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="width: 32px; height: 32px; border-radius: 8px; background: var(--bg-color); display: flex; align-items: center; justify-content: center; font-size: 1.2rem; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">
                                🔑
                            </div>
                            <span>${p.title}</span>
                        </div>
                    </td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 5px;">
                            <span style="font-family: monospace;">${p.user || '-'}</span>
                            ${p.user ? `<button class="btn-icon" onclick="app.copyText('${p.user.replace(/'/g, "\\'").replace(/"/g, '&quot;')}')" title="Copiar usuario" style="font-size: 0.8rem; opacity: 0.7;">📋</button>` : ''}
                        </div>
                    </td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 5px;">
                            <span style="font-family: monospace; letter-spacing: 2px;">${this.vaultUnlocked ? '••••••••' : displayPass}</span>
                            ${copyBtn}
                        </div>
                    </td>
                    <td>
                        ${p.url ? `<a href="${p.url.startsWith('http') ? p.url : 'https://' + p.url}" target="_blank" style="color: var(--primary); text-decoration: none;">${p.url.substring(0,30)}${p.url.length > 30 ? '...' : ''}</a>` : '-'}
                    </td>
                    <td>
                        <div style="max-height: 40px; overflow-y: auto; font-size: 0.85rem; opacity: 0.8;">
                            ${p.notes ? p.notes.replace(/\\n/g, '<br>') : '-'}
                        </div>
                    </td>
                    <td style="text-align: center;">
                        <button class="btn-icon" onclick="app.editPassword(${p.id})" title="Editar">✏️</button>
                        <button class="btn-icon btn-delete" onclick="app.deletePassword(${p.id})" title="Eliminar">🗑️</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // --- SERVER VAULT LOGIC ---
    openServerModal() {
        this.editingServerId = null;
        if (this.serverForm) this.serverForm.reset();
        const titleEl = document.getElementById('serverModalTitle');
        if (titleEl) titleEl.textContent = 'Nuevo Servidor';

        if (this.serverCurrentPass) this.serverCurrentPass.type = 'password';
        if (this.serverPrevPass) this.serverPrevPass.type = 'password';
        document.querySelectorAll('.btn-toggle-pass').forEach(btn => btn.textContent = '👁️');

        if (this.serverEnvironment) this.serverEnvironment.value = 'desarrollo';
        if (this.serverHasOracle) this.serverHasOracle.checked = false;
        if (this.serverHasJboss) this.serverHasJboss.checked = false;

        this.openModal(this.modalServer);
    }

    editServer(id) {
        if (!this.vaultUnlocked) {
            this.showToast('⚠️ Desbloquea las bóvedas primero para editar servidores con credenciales', 3000);
            return;
        }
        const s = this.servers.find(srv => srv.id === id);
        if (s) {
            this.editingServerId = id;
            const titleEl = document.getElementById('serverModalTitle');
            if (titleEl) titleEl.textContent = 'Editar Servidor';
            if (this.serverIP) this.serverIP.value = s.ip || '';
            if (this.serverHostname) this.serverHostname.value = s.hostname || '';
            if (this.serverApp) this.serverApp.value = s.app || '';
            if (this.serverDB) this.serverDB.value = s.db || '';
            if (this.serverUser) this.serverUser.value = s.user || '';
            if (this.serverCurrentPass) this.serverCurrentPass.value = this.decryptData(s.currentPass) || '';
            if (this.serverPrevPass) this.serverPrevPass.value = this.decryptData(s.prevPass) || '';
            if (this.serverNotes) this.serverNotes.value = s.notes || '';
            if (this.serverEnvironment) this.serverEnvironment.value = s.environment || 'desarrollo';
            if (this.serverHasOracle) this.serverHasOracle.checked = !!s.hasOracle;
            if (this.serverHasJboss) this.serverHasJboss.checked = !!s.hasJboss;

            if (this.serverCurrentPass) this.serverCurrentPass.type = 'password';
            if (this.serverPrevPass) this.serverPrevPass.type = 'password';
            document.querySelectorAll('.btn-toggle-pass').forEach(btn => btn.textContent = '👁️');

            this.openModal(this.modalServer);
        }
    }

    saveServer() {
        const ip = this.serverIP ? this.serverIP.value.trim() : '';
        const hostname = this.serverHostname ? this.serverHostname.value.trim() : '';
        const app = this.serverApp ? this.serverApp.value.trim() : '';
        const db = this.serverDB ? this.serverDB.value.trim() : '';
        const user = this.serverUser ? this.serverUser.value.trim() : '';
        const currentPass = this.serverCurrentPass ? this.serverCurrentPass.value : '';
        const prevPass = this.serverPrevPass ? this.serverPrevPass.value : '';
        const notes = this.serverNotes ? this.serverNotes.value.trim() : '';
        const environment = this.serverEnvironment ? this.serverEnvironment.value : 'desarrollo';
        const hasOracle = this.serverHasOracle ? this.serverHasOracle.checked : false;
        const hasJboss = this.serverHasJboss ? this.serverHasJboss.checked : false;

        if (!ip || !hostname) return;

        const ns = {
            id: this.editingServerId || Date.now(),
            ip,
            hostname,
            app,
            db,
            user,
            currentPass: this.encryptData(currentPass),
            prevPass: this.encryptData(prevPass),
            notes,
            environment,
            hasOracle,
            hasJboss
        };

        if (this.editingServerId) {
            const idx = this.servers.findIndex(s => s.id === this.editingServerId);
            if (idx > -1) this.servers[idx] = ns;
            this.editingServerId = null;
            this.showToast('Servidor actualizado con éxito');
        } else {
            this.servers.push(ns);
            this.showToast('Servidor guardado con éxito');
        }

        this.saveAndRefresh();
        this.closeAllModals();
        if (this.serverForm) this.serverForm.reset();
    }

    deleteServer(id) {
        const s = this.servers.find(srv => srv.id === id);
        if (s) {
            this.moveToTrash(s, 'server');
            this.servers = this.servers.filter(srv => srv.id !== id);
            this.saveAndRefresh();
        }
    }

    showServerNotes(id) {
        const server = this.servers.find(s => s.id === id);
        if (!server || !server.notes) return;
        
        this.serverNotesHostname.textContent = server.hostname;
        this.serverNotesText.value = server.notes;
        this.openModal(this.modalServerNotes);
    }

    renderServers() {
        if (!this.serverList) return;
        
        // Remove grid layout to allow table to flow normally
        this.serverList.classList.remove('server-grid');
        this.serverList.style.display = 'block';

        const filtered = this.servers.filter(s => {
            const globalTerm = (this.searchTerm || '').toLowerCase();
            const serverTerm = (this.serverSearchInput ? this.serverSearchInput.value : '').toLowerCase();
            const envLabel = s.environment === 'produccion' ? 'produccion prod' : 'desarrollo dev';
            
            const match = (term) => {
                if (!term) return true;
                return (
                    s.ip.toLowerCase().includes(term) ||
                    s.hostname.toLowerCase().includes(term) ||
                    (s.app && s.app.toLowerCase().includes(term)) ||
                    (s.db && s.db.toLowerCase().includes(term)) ||
                    (s.notes && s.notes.toLowerCase().includes(term)) ||
                    envLabel.includes(term) ||
                    (s.hasOracle && 'oracle db bd'.includes(term)) ||
                    (s.hasJboss && 'jboss'.includes(term))
                );
            };

            return match(globalTerm) && match(serverTerm);
        });

        if (filtered.length === 0) {
            this.serverList.innerHTML = '<div class="empty-state">La bóveda de servidores está vacía</div>';
            return;
        }

        const tbody = filtered.map(s => {
            const envBadge = s.environment === 'produccion' 
                ? `<span class="tag tag-urgente" style="font-size: 0.65rem;">PROD</span>` 
                : `<span class="tag tag-personal" style="font-size: 0.65rem;">DEV</span>`;
                
            const stackBadges = [];
            if(s.app) stackBadges.push(`<span class="server-app-badge">${s.app}</span>`);
            if(s.hasOracle) stackBadges.push(`<span class="server-app-badge" style="background: rgba(245, 158, 11, 0.15); color: var(--warning); border-color: rgba(245, 158, 11, 0.3);">Oracle DB</span>`);
            if(s.hasJboss) stackBadges.push(`<span class="server-app-badge" style="background: rgba(16, 185, 129, 0.15); color: var(--success); border-color: rgba(16, 185, 129, 0.3);">JBoss</span>`);

            let credsHtml = '';
            if (s.user) credsHtml += `<div style="font-size: 0.85rem; font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">Usuario: ${s.user}</div>`;
            if (this.vaultUnlocked) {
                if(s.currentPass) {
                    const decCurr = this.decryptData(s.currentPass);
                    const safeDecCurr = decCurr.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                    credsHtml += `<div style="display: flex; align-items: center; gap: 6px;"><small style="color:var(--text-secondary);">Actual:</small> <span id="pass-curr-${s.id}" class="masked-pass" style="letter-spacing: 2px;" data-real="${decCurr.replace(/"/g, '&quot;')}">••••••••</span> <button class="btn-copy-small" onclick="app.toggleCardPassVisibility(${s.id}, 'curr')" title="Mostrar/Ocultar">👁️</button> <button class="btn-copy-small" onclick="app.copyText('${safeDecCurr}', 'Contraseña copiada')" title="Copiar Contraseña">📋</button></div>`;
                }
                if(s.prevPass) {
                    const decPrev = this.decryptData(s.prevPass);
                    const safeDecPrev = decPrev.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                    credsHtml += `<div style="display: flex; align-items: center; gap: 6px; margin-top: 4px;"><small style="color:var(--text-secondary);">Ant:</small> <span id="pass-prev-${s.id}" class="masked-pass" style="letter-spacing: 2px;" data-real="${decPrev.replace(/"/g, '&quot;')}">••••••••</span> <button class="btn-copy-small" onclick="app.toggleCardPassVisibility(${s.id}, 'prev')" title="Mostrar/Ocultar">👁️</button> <button class="btn-copy-small" onclick="app.copyText('${safeDecPrev}', 'Contraseña anterior copiada')" title="Copiar Contraseña anterior">📋</button></div>`;
                }
            } else {
                if(s.currentPass || s.prevPass) {
                    credsHtml += `<div style="display: flex; align-items: center; gap: 6px; color: var(--danger);"><small>[Contraseñas Bloqueadas 🔒]</small></div>`;
                }
            }

            return `
            <tr data-id="${s.id}">
                <td>
                    <div style="font-weight: 700; color: var(--text-primary); margin-bottom: 6px; font-family: 'Outfit', sans-serif;">${s.hostname}</div>
                    ${envBadge}
                </td>
                <td style="font-family: monospace;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        ${s.ip}
                        <button class="btn-copy-small" onclick="app.copyText('${s.ip}', 'IP copiada')" title="Copiar IP">📋</button>
                    </div>
                </td>
                <td>
                    <div style="display: flex; gap: 4px; flex-wrap: wrap;">${stackBadges.join('')}</div>
                </td>
                <td>${s.db || '-'}</td>
                <td>
                    ${credsHtml || '-'}
                </td>
                <td style="text-align: center;">
                    <div class="contact-actions">
                        ${s.notes ? `<button class="btn-icon" onclick="app.showServerNotes(${s.id})" title="Ver Notas" type="button" style="color: var(--accent);">📝</button>` : ''}
                        <button class="btn-icon" onclick="app.editServer(${s.id})" title="Editar" type="button">✏️</button>
                        <button class="btn-icon" onclick="app.deleteServer(${s.id})" title="Eliminar" type="button">🗑️</button>
                    </div>
                </td>
            </tr>
            `;
        }).join('');
        
        this.serverList.innerHTML = `
            <div class="directory-table-container">
                <table class="directory-table">
                    <thead>
                        <tr>
                            <th>Hostname / Ambiente</th>
                            <th>IP / Host</th>
                            <th>App / Stack</th>
                            <th>Base de Datos</th>
                            <th>Credenciales / Notas</th>
                            <th style="text-align: center; width: 110px;">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tbody}
                    </tbody>
                </table>
            </div>
        `;
    }

    openContactModal() {
        this.editingContactId = null;
        if (this.contactForm) this.contactForm.reset();
        if (this.contactSupportActions) this.contactSupportActions.value = '';
        const titleEl = document.getElementById('contactModalTitle');
        if (titleEl) titleEl.textContent = 'Nuevo Contacto';
        if (this.btnCancelContactEdit) this.btnCancelContactEdit.style.display = 'none';
        this.openModal(this.modalContact);
    }

    editContact(id) {
        const c = this.directory.find(item => item.id === id);
        if (c) {
            this.editingContactId = id;
            const titleEl = document.getElementById('contactModalTitle');
            if (titleEl) titleEl.textContent = 'Editar Contacto';
            if (this.contactName) this.contactName.value = c.name || '';
            if (this.contactPhone) this.contactPhone.value = c.phone || '';
            if (this.contactEmail) this.contactEmail.value = c.email || '';
            if (this.contactNotes) this.contactNotes.value = c.notes || '';
            if (this.contactSupportActions) this.contactSupportActions.value = c.supportActions || '';
            if (this.btnCancelContactEdit) this.btnCancelContactEdit.style.display = 'inline-block';
            this.openModal(this.modalContact);
        }
    }

    saveContact() {
        const name = this.contactName ? this.contactName.value.trim() : '';
        const phone = this.contactPhone ? this.contactPhone.value.trim() : '';
        const email = this.contactEmail ? this.contactEmail.value.trim() : '';
        const notes = this.contactNotes ? this.contactNotes.value.trim() : '';
        const supportActions = this.contactSupportActions ? this.contactSupportActions.value.trim() : '';

        if (!name || !phone) return;

        const nc = {
            id: this.editingContactId || Date.now(),
            name,
            phone,
            email,
            notes,
            supportActions
        };

        if (this.editingContactId) {
            const idx = this.directory.findIndex(item => item.id === this.editingContactId);
            if (idx > -1) this.directory[idx] = nc;
            this.editingContactId = null;
            this.showToast('Contacto actualizado con éxito');
        } else {
            this.directory.push(nc);
            this.showToast('Contacto guardado con éxito');
        }

        this.saveAndRefresh();
        this.closeAllModals();
        if (this.contactForm) this.contactForm.reset();
        if (this.contactSupportActions) this.contactSupportActions.value = '';
    }

    deleteContact(id) {
        const c = this.directory.find(item => item.id === id);
        if (c && confirm(`¿Seguro que deseas eliminar a ${c.name}?`)) {
            this.moveToTrash(c, 'contacto');
            this.directory = this.directory.filter(item => item.id !== id);
            this.saveAndRefresh();
        }
    }

    renderDirectory() {
        if (!this.contactList) return;

        const term = (this.directorySearchInput ? this.directorySearchInput.value : '').toLowerCase();
        const filtered = this.directory.filter(c => {
            return (
                c.name.toLowerCase().includes(term) ||
                c.phone.toLowerCase().includes(term) ||
                (c.email && c.email.toLowerCase().includes(term)) ||
                (c.notes && c.notes.toLowerCase().includes(term)) ||
                (c.supportActions && c.supportActions.toLowerCase().includes(term))
            );
        });

        if (filtered.length === 0) {
            this.contactList.innerHTML = '<tr><td colspan="6" class="empty-state" style="text-align: center; padding: 2rem;">El directorio está vacío</td></tr>';
            return;
        }

        this.contactList.innerHTML = filtered.map(c => {
            const emailContent = c.email 
                ? `<span>${c.email}</span><button class="btn-copy-small" onclick="app.copyText('${c.email}', 'Email copiado')" title="Copiar Email" type="button">📋</button>`
                : '-';
            const phoneContent = c.phone 
                ? `<span>${c.phone}</span><button class="btn-copy-small" onclick="app.copyText('${c.phone}', 'Teléfono copiado')" title="Copiar Teléfono" type="button">📋</button>`
                : '-';
            
            return `
            <tr data-id="${c.id}">
                <td style="font-weight: 700; color: var(--text-primary);">${c.name}</td>
                <td><div style="display: flex; align-items: center; gap: 6px;">${phoneContent}</div></td>
                <td style="font-family: monospace; font-size: 0.85rem;"><div style="display: flex; align-items: center; gap: 6px;">${emailContent}</div></td>
                <td style="white-space: pre-wrap; color: var(--text-primary); font-size: 0.85rem;">${c.notes || '-'}</td>
                <td style="white-space: pre-wrap; color: var(--text-primary); font-size: 0.85rem;">${c.supportActions || '-'}</td>
                <td style="text-align: center;">
                    <div class="contact-actions">
                        <button class="btn-icon" onclick="app.editContact(${c.id})" title="Editar" type="button">✏️</button>
                        <button class="btn-icon" onclick="app.deleteContact(${c.id})" title="Eliminar" type="button">🗑️</button>
                    </div>
                </td>
            </tr>
            `;
        }).join('');
    }

    toggleCardPassVisibility(id, type) {
        const el = document.getElementById(`pass-${type}-${id}`);
        if (el) {
            const isMasked = el.textContent === '••••••••';
            el.textContent = isMasked ? el.dataset.real : '••••••••';
        }
    }

    copyText(text, msg = 'Copiado al portapapeles') {
        navigator.clipboard.writeText(text).then(() => {
            this.showToast(msg);
        }).catch(err => {
            console.error('Error al copiar: ', err);
            this.showToast('Error al copiar');
        });
    }

    // --- TRASH LOGIC ---
    moveToTrash(data, type) {
        const now = new Date();
        const timestamp = now.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

        const trashItem = {
            trashId: Date.now(),
            type: type,
            data: { ...data },
            deletedAt: timestamp,
            deletedAtRaw: now.getTime()
        };

        this.trash.unshift(trashItem);
        this.showToast(`${type === 'task' ? 'Tarea' : type === 'note' ? 'Nota' : 'Pendiente'} movida a la papelera`);
    }

    restoreItem(trashId) {
        const item = this.trash.find(it => it.trashId === trashId);
        if (!item) return;

        if (item.type === 'task') {
            this.tasks.push(item.data);
        } else if (item.type === 'note') {
            this.notes.unshift(item.data);
        } else if (item.type === 'pendiente') {
            this.pendientes.unshift(item.data);
        } else if (item.type === 'server') {
            this.servers.push(item.data);
        } else if (item.type === 'contacto') {
            this.directory.push(item.data);
        }

        this.trash = this.trash.filter(it => it.trashId !== trashId);
        this.saveAndRefresh();
        this.showToast('Elemento restaurado');
    }

    permanentlyDelete(trashId) {
        if (confirm('¿Eliminar permanentemente? Esta acción no se puede deshacer.')) {
            this.trash = this.trash.filter(it => it.trashId !== trashId);
            this.saveAndRefresh();
        }
    }

    emptyTrash() {
        if (this.trash.length === 0) return;
        if (confirm('¿Vaciar toda la papelera? Se perderán todos los elementos permanentemente.')) {
            this.trash = [];
            this.saveAndRefresh();
            this.showToast('Papelera vaciada');
        }
    }
    showToast(m) {
        const t = document.createElement('div');
        t.className = 'toast';
        t.innerHTML = `<span>${m}</span><button class="toast-close">&times;</button>`;
        this.toastContainer.appendChild(t);
        t.querySelector('.toast-close').onclick = () => t.remove();
        
        // Auto-remove after 15 seconds
        setTimeout(() => {
            if (t.parentNode) {
                t.remove();
            }
        }, 15000);
    }
    saveAgendaDraft(h, t) { this.agendaDrafts[h] = t; localStorage.setItem('tm_agenda_drafts', JSON.stringify(this.agendaDrafts)); }
    startBackgroundProcesses() {
        this.updateDateDisplay();
        this.updateActiveTaskBanner();
        setInterval(() => {
            this.updateDateDisplay();
            this.updateActiveTaskBanner();
            this.updateCommandCenterClock();
        }, 1000);
        setInterval(() => this.checkReminders(), 30000);
        // Refresh command center every 60 seconds if it's active
        setInterval(() => {
            if (this.activeTab === 'tabCommandCenter') this.renderCommandCenter();
        }, 60000);
        setInterval(async () => {
            if (this.isOffline) {
                try {
                    const res = await fetch('/api/db-status');
                    if (res.ok) {
                        const data = await res.json();
                        if (data.connected) {
                            this.isOffline = false;
                            this.showToast('✅ ¡Conexión con Oracle DB detectada! Sincronizando...');
                            await this.loadAllData();
                            this.renderAll();
                            this.updateStorageStatus();
                        }
                    }
                } catch (e) {}
            }
        }, 30000);
    }
    checkReminders() {
        const now = new Date();
        // Construct local string YYYY-MM-DDTHH:mm
        const Y = now.getFullYear();
        const M = (now.getMonth() + 1).toString().padStart(2, '0');
        const D = now.getDate().toString().padStart(2, '0');
        const h = now.getHours().toString().padStart(2, '0');
        const m = now.getMinutes().toString().padStart(2, '0');
        const currentStr = `${Y}-${M}-${D}T${h}:${m}`;

        // Check Tasks
        this.tasks.forEach(t => {
            if (!this.notifiedItems.has(`task-${t.id}`) && t.start && t.start === currentStr) {
                this.showToast(`🔔 Tarea: ${t.title}`);
                this.notifiedItems.add(`task-${t.id}`);
            }
        });

        // Check Notes
        this.notes.forEach(n => {
            if (!this.notifiedItems.has(`note-${n.id}`) && n.date && n.date === currentStr) {
                this.showToast(`💡 Nota: ${n.text.substring(0, 20)}...`);
                this.notifiedItems.add(`note-${n.id}`);
            }
        });
    }
    dismissMeetingReminder(id) {
        if (!this.dismissedReminders) this.dismissedReminders = new Set();
        this.dismissedReminders.add(id);
        try {
            localStorage.setItem('tm_dismissed_reminders', JSON.stringify([...this.dismissedReminders]));
        } catch (e) {}
        this.updateActiveTaskBanner();
    }

    dismissAllMeetingReminders(ids) {
        if (!this.dismissedReminders) this.dismissedReminders = new Set();
        if (Array.isArray(ids)) {
            ids.forEach(id => this.dismissedReminders.add(id));
        }
        try {
            localStorage.setItem('tm_dismissed_reminders', JSON.stringify([...this.dismissedReminders]));
        } catch (e) {}
        this.updateActiveTaskBanner();
    }

    completeAndDismissTask(taskId, reminderId) {
        this.toggleCompletion(taskId);
        if (reminderId) {
            this.dismissMeetingReminder(reminderId);
        }
    }

    updateActiveTaskBanner() {
        if (!this.dismissedReminders) {
            this.dismissedReminders = new Set(JSON.parse(localStorage.getItem('tm_dismissed_reminders') || '[]'));
        }
        if (!this.notifiedMeetingReminderIds) {
            this.notifiedMeetingReminderIds = new Set();
        }

        const now = new Date();
        const todayStr = now.toLocaleDateString('sv-SE');
        const currentHourStr = `${now.getHours().toString().padStart(2, '0')}:00`;
        const currentMinutesTotal = now.getHours() * 60 + now.getMinutes();

        const activeReminders = [];

        // 1. Scheduled tasks active now
        this.tasks.forEach(t => {
            if (!t.start) return;
            const comp = this.isTaskCompletedToday(t, todayStr);
            if (comp) return;
            const isActiveToday = this.isTaskActiveToday(t, now);
            if (!isActiveToday) return;

            const taskStart = new Date(t.start);
            const taskEnd = t.end ? new Date(t.end) : new Date(taskStart.getTime() + 3600000);
            
            const startMins = taskStart.getHours() * 60 + taskStart.getMinutes();
            const endMins = taskEnd.getHours() * 60 + taskEnd.getMinutes();

            if (currentMinutesTotal >= startMins && currentMinutesTotal < endMins) {
                const reminderId = `task-${t.id}-${todayStr}-${taskStart.getHours()}`;
                if (!this.dismissedReminders.has(reminderId)) {
                    const startT = taskStart.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                    const endT = taskEnd.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                    activeReminders.push({
                        id: reminderId,
                        type: 'task',
                        taskId: t.id,
                        title: t.title,
                        timeRange: `${startT} - ${endT}`,
                        priority: t.priority || 'media',
                        category: t.category || 'Actividades'
                    });
                }
            }
        });

        // 2. Agenda draft notes in current hour slot
        if (this.agendaDrafts && this.agendaDrafts[currentHourStr]) {
            const draftText = this.agendaDrafts[currentHourStr].trim();
            if (draftText.length > 0) {
                const reminderId = `agenda-${todayStr}-${currentHourStr}-${draftText.substring(0, 15)}`;
                if (!this.dismissedReminders.has(reminderId)) {
                    const nextH = (now.getHours() + 1).toString().padStart(2, '0');
                    activeReminders.push({
                        id: reminderId,
                        type: 'agendaDraft',
                        title: draftText,
                        timeRange: `${currentHourStr} - ${nextH}:00`,
                        priority: 'trabajo',
                        category: 'Agenda'
                    });
                }
            }
        }

        // Play chime sound if new undismissed reminder appears
        const newReminders = activeReminders.filter(r => !this.notifiedMeetingReminderIds.has(r.id));
        if (newReminders.length > 0) {
            this.playNotificationSound();
            newReminders.forEach(r => this.notifiedMeetingReminderIds.add(r.id));
        }

        // Render Top Active Task Banner (#activeTaskBanner)
        const banner = document.getElementById('activeTaskBanner');
        if (banner) {
            if (activeReminders.length > 0) {
                const first = activeReminders[0];
                const priorityColors = {
                    alta: 'var(--tag-urgent)',
                    baja: 'var(--tag-personal)',
                    trabajo: 'var(--tag-work)',
                    media: 'var(--accent)'
                };
                const pColor = priorityColors[(first.priority || 'media').toLowerCase()] || 'var(--accent)';

                banner.innerHTML = `
                    <div class="active-task-content">
                        <span class="active-task-pulse" style="background-color: ${pColor}; box-shadow: 0 0 0 0 ${pColor};"></span>
                        <span class="active-task-label">EN CURSO:</span>
                        <span class="active-task-title">${first.title}</span>
                        <span class="active-task-time">🕒 ${first.timeRange}</span>
                    </div>
                    <div class="active-task-actions" style="display: flex; gap: 8px; align-items: center;">
                        ${first.type === 'task' ? `<button class="btn btn-primary btn-small" onclick="app.completeAndDismissTask(${first.taskId}, '${first.id}')" style="background: ${pColor}; border-color: ${pColor};">✓ Completar</button>` : ''}
                        <button class="btn btn-secondary btn-small" onclick="app.dismissMeetingReminder('${first.id}')">❌ Descartar</button>
                    </div>
                `;
                banner.style.display = 'flex';
            } else {
                banner.style.display = 'none';
            }
        }

        // Render Floating Teams/Outlook Meeting Reminder Dialog (#teamsMeetingReminderContainer)
        const container = document.getElementById('teamsMeetingReminderContainer');
        if (container) {
            if (activeReminders.length > 0) {
                const reminderIdsJson = JSON.stringify(activeReminders.map(r => r.id)).replace(/"/g, '&quot;');
                
                const itemsHtml = activeReminders.map(r => {
                    const categoryBadge = `<span class="teams-reminder-badge">${r.category}</span>`;
                    const actionBtn = r.type === 'task'
                        ? `<button class="btn-teams-complete" onclick="app.completeAndDismissTask(${r.taskId}, '${r.id}')">✓ Completar</button>`
                        : `<button class="btn-teams-complete" onclick="app.dismissMeetingReminder('${r.id}')">✓ Entendido</button>`;

                    return `
                        <div class="teams-reminder-item">
                            <div class="teams-reminder-event-name">${r.title}</div>
                            <div class="teams-reminder-details">
                                <span>🕒 ${r.timeRange}</span>
                                ${categoryBadge}
                            </div>
                            <div class="teams-reminder-actions">
                                <button class="btn-teams-dismiss" onclick="app.dismissMeetingReminder('${r.id}')">❌ Descartar</button>
                                ${actionBtn}
                            </div>
                        </div>
                    `;
                }).join('');

                container.innerHTML = `
                    <div class="teams-reminder-box">
                        <div class="teams-reminder-header-bar">
                            <div class="teams-reminder-header-title">
                                <span class="teams-reminder-pulse"></span>
                                <span>🔔 RECORDATORIO DE AGENDA / REUNIÓN</span>
                            </div>
                            <span style="font-size: 0.75rem; color: #a5b4fc; font-weight: 700;">${activeReminders.length} activo(s)</span>
                        </div>
                        <div class="teams-reminder-body-list">
                            ${itemsHtml}
                        </div>
                        ${activeReminders.length > 1 ? `
                        <div class="teams-reminder-global-footer">
                            <button class="btn-teams-dismiss" onclick="app.dismissAllMeetingReminders(${reminderIdsJson})">Descartar Todos (${activeReminders.length})</button>
                        </div>
                        ` : ''}
                    </div>
                `;
                container.style.display = 'block';
            } else {
                container.style.display = 'none';
                container.innerHTML = '';
            }
        }
    }
    playNotificationSound() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            
            const playTone = (freq, startTime, duration) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, startTime);
                
                gain.gain.setValueAtTime(0.15, startTime);
                gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
                
                osc.connect(gain);
                gain.connect(ctx.destination);
                
                osc.start(startTime);
                osc.stop(startTime + duration);
            };
            
            const now = ctx.currentTime;
            // Synthesize a beautiful double bell chime
            playTone(523.25, now, 0.4); // C5
            playTone(659.25, now + 0.1, 0.4); // E5
        } catch (e) {
            console.error("AudioContext blocked or not supported:", e);
        }
    }
    togglePomodoro() { if (this.pomodoro.isActive) { clearInterval(this.pomodoro.timer); this.pomodoro.isActive = false; this.btnPomodoroStart.textContent = 'Reanudar'; } else { this.pomodoro.isActive = true; this.btnPomodoroStart.textContent = 'Pausar'; this.pomodoro.timer = setInterval(() => { this.pomodoro.timeLeft--; this.updatePomodoroUI(); if (this.pomodoro.timeLeft <= 0) { clearInterval(this.pomodoro.timer); this.pomodoro.isActive = false; this.switchPomodoroMode(); } }, 1000); } }
    updatePomodoroUI() { const m = Math.floor(this.pomodoro.timeLeft / 60), s = this.pomodoro.timeLeft % 60; this.pomodoroDisplay.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`; }
    resetPomodoro() { clearInterval(this.pomodoro.timer); this.pomodoro.isActive = false; this.pomodoro.timeLeft = this.pomodoro.mode === 'work' ? 1500 : 300; this.updatePomodoroUI(); this.btnPomodoroStart.textContent = 'Iniciar'; }
    switchPomodoroMode() { this.pomodoro.mode = this.pomodoro.mode === 'work' ? 'break' : 'work'; this.pomodoro.timeLeft = this.pomodoro.mode === 'work' ? 1500 : 300; this.pomodoroMode.textContent = this.pomodoro.mode === 'work' ? 'Concentración' : 'Descanso'; this.updatePomodoroUI(); }
    showSummary() {
        const today = new Date();
        const sDate = today.toLocaleDateString('sv-SE');
        const todayTasks = this.tasks.filter(t => {
            const act = this.isTaskActiveToday(t, today);
            const comp = this.isTaskCompletedToday(t, sDate);
            return !comp && (act || t.status === 'todo');
        });
        let s = `Hola\n\nLas actividades que se realizarán el día de hoy son las siguientes:\n\n`;
        todayTasks.forEach(t => {
            let depSuffix = '';
            if (t.dependencyType === 'me') {
                depSuffix = ' (Depende de mí)';
            } else if (t.dependencyType === 'area') {
                depSuffix = ` (Depende de: ${t.dependencyArea || 'Otra área'})`;
            }
            s += `- ${t.title}${depSuffix}\n`;
        });
        s += `\nSaludos`;
        this.summaryText.value = s;
        this.openModal(this.modalSummary);
    }
    copySummary() {
        if (!this.summaryText.value) return;
        navigator.clipboard.writeText(this.summaryText.value).then(() => {
            this.showToast('Resumen copiado al portapapeles');
        }).catch(err => {
            console.error('Error al copiar: ', err);
            this.showToast('Error al copiar');
        });
    }
    exportToExcel() {
        let csv = "Tipo,ID,Titulo/Contenido,Categoria,Estado/Importancia,Inicio,Fin,Fecha\n";

        // Tasks
        this.tasks.forEach(t => {
            const title = (t.title || "").replace(/"/g, '""');
            const cat = (t.category || "").replace(/"/g, '""');
            csv += `Tarea,${t.id},"${title}","${cat}",${t.completed ? "Completada" : "Pendiente"},${t.start || ""},${t.end || ""},-\n`;
        });

        // Notes
        this.notes.forEach(n => {
            const text = (n.text || "").replace(/"/g, '""');
            csv += `Nota,${n.id},"${text}",-,${n.importance || 2},-,-,${n.date || ""}\n`;
        });

        // Pendientes
        this.pendientes.forEach(p => {
            const text = (p.text || "").replace(/"/g, '""');
            csv += `Pendiente,${p.id},"${text}",-,${p.completed ? "Completada" : "Pendiente"},-,-,${p.createdAt}\n`;
        });

        // Servers
        this.servers.forEach(s => {
            const envText = s.environment === 'produccion' ? 'Producción' : 'Desarrollo';
            const stackArray = [];
            if (s.hasOracle) stackArray.push('Oracle DB');
            if (s.hasJboss) stackArray.push('JBoss');
            const stackText = stackArray.join(' + ') || '-';
            const content = `IP: ${s.ip} | Hostname: ${s.hostname} | Ambiente: ${envText} | Stack: ${stackText} | App: ${s.app || '-'} | DB: ${s.db || '-'} | Pass: ${s.currentPass || '-'} | Prev Pass: ${s.prevPass || '-'} | Notas: ${s.notes || '-'}`.replace(/"/g, '""');
            csv += `Servidor,${s.id},"${content}",-, -, -, -, -\n`;
        });

        // Directory
        this.directory.forEach(c => {
            const name = (c.name || "").replace(/"/g, '""');
            const phone = (c.phone || "").replace(/"/g, '""');
            const email = (c.email || "").replace(/"/g, '""');
            const notes = (c.notes || "").replace(/"/g, '""');
            const content = `Nombre: ${name} | Teléfono: ${phone} | Email: ${email} | Notas: ${notes}`.replace(/"/g, '""');
            csv += `Contacto,${c.id},"${content}",-, -, -, -, -\n`;
        });

        // Trash
        this.trash.forEach(it => {
            const typeLabels = { task: 'Tarea', note: 'Nota', pendiente: 'Pendiente', server: 'Servidor' };
            const title = (it.data.title || it.data.text || (it.data.hostname ? `${it.data.hostname} (${it.data.ip})` : "") || "").replace(/"/g, '""');
            csv += `Papelera (${typeLabels[it.type] || it.type}),${it.data.id || it.data.trashId},"${title}",-,-,-,-,${it.deletedAt}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const l = document.createElement("a");
        l.href = URL.createObjectURL(blob);
        l.download = `taskmaster_pro_export.csv`;
        l.click();
    }

    exportJson() { 
        const d = JSON.stringify({ 
            tasks: this.tasks, 
            notes: this.notes, 
            servers: this.servers,
            agenda: this.agendaDrafts, 
            categories: this.categories,
            pendientes: this.pendientes,
            trash: this.trash,
            directory: this.directory,
            files: this.files
        }); 
        const blob = new Blob([d], { type: 'application/json' }); 
        const l = document.createElement("a"); 
        l.href = URL.createObjectURL(blob); 
        l.download = `backup_${new Date().toISOString().split('T')[0]}.json`; 
        l.click(); 
        
        // Record manual export time
        localStorage.setItem('tm_last_manual_export', Date.now());
    }

    importJson(ev) {
        const f = ev.target.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = (e) => {
            try {
                const d = JSON.parse(e.target.result);
                this.tasks = d.tasks || [];
                this.notes = d.notes || [];
                this.servers = d.servers || [];
                this.agendaDrafts = d.agenda || {};
                if (d.categories) this.categories = d.categories;
                this.pendientes = d.pendientes || [];
                this.trash = d.trash || [];
                this.directory = d.directory || [];
                this.files = d.files || [];

                this.saveAndRefresh();
                this.updateCategorySelect();
                this.showToast('Backup restaurado con éxito');
            } catch (err) {
                console.error("Import error:", err);
                this.showToast('Error al restaurar el backup');
            }
        };
        r.readAsText(f);
    }

    async loadVersionsList() {
        if (!this.versionsList) return;
        if (this.isOffline) {
            this.versionsList.innerHTML = '<div class="empty-state">El control de versiones solo está disponible cuando estás conectado a Oracle DB.</div>';
            return;
        }
        try {
            this.versionsList.innerHTML = '<div class="empty-state">Cargando versiones...</div>';
            const response = await fetch('/api/versions');
            if (response.ok) {
                const versions = await response.json();
                this.versions = versions;
                if (versions.length === 0) {
                    this.versionsList.innerHTML = '<div class="empty-state">No hay versiones guardadas en la base de datos.</div>';
                    return;
                }
                this.versionsList.innerHTML = versions.map(v => {
                    const date = new Date(v.lastUpdated).toLocaleString('es-ES');
                    const isActive = (!this.isPreviewMode && v.id === this.currentVersionId) || (this.isPreviewMode && v.id === this.loadedVersionId);
                    const activeBadge = isActive ? '<span class="tag tag-personal" style="font-size: 0.7rem; padding: 2px 6px;">Activa</span>' : '';
                    const btnText = isActive ? 'Actual' : 'Previsualizar';
                    const btnClass = isActive ? 'btn-secondary' : 'btn-primary';
                    return `
                    <div class="version-card" style="background: var(--glass); border: 1px solid var(--border-color); padding: 0.5rem 1rem; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 0.5rem;">
                        <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;">
                           <span style="font-weight: 700; color: var(--text-primary); white-space: nowrap;">Versión #${v.id}</span>
                           ${activeBadge}
                           <span style="font-size: 0.8rem; color: var(--text-secondary); white-space: nowrap; display: flex; align-items: center; gap: 4px;">📅 ${date}</span>
                           <span style="font-size: 0.85rem; color: var(--text-primary); font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 500px;" title="${v.description.replace(/"/g, '&quot;')}">"${v.description}"</span>
                        </div>
                        <button class="btn ${btnClass}" style="padding: 4px 12px; font-size: 0.8rem; height: fit-content;" onclick="app.previewVersion(${v.id})" ${isActive ? 'disabled style="opacity: 0.5;"' : ''} type="button">${btnText}</button>
                    </div>
                    `;
                }).join('');
            } else {
                this.versionsList.innerHTML = '<div class="empty-state">Error al cargar las versiones desde el servidor.</div>';
            }
        } catch (err) {
            console.error("Error loading versions:", err);
            this.versionsList.innerHTML = '<div class="empty-state">Error de red al obtener versiones.</div>';
        }
    }

    async previewVersion(versionId) {
        if (this.isOffline) return;
        try {
            this.showToast(`Cargando versión #${versionId}...`);
            const response = await fetch(`/api/data?versionId=${versionId}`);
            if (response.ok) {
                const data = await response.json();
                
                // Load data to memory
                this.tasks = data.tasks || [];
                this.notes = data.notes || [];
                this.servers = data.servers || [];
                this.categories = data.categories || this.categories;
                this.agendaDrafts = data.agenda || {};
                this.pendientes = data.pendientes || [];
                this.trash = data.trash || [];
                this.directory = data.directory || [];
                this.files = data.files || [];
                
                this.isPreviewMode = true;
                this.loadedVersionId = versionId;
                
                // Show Banner
                if (this.previewBanner) {
                    this.previewBanner.style.display = 'flex';
                    const formattedDate = new Date(data.lastUpdated).toLocaleString('es-ES');
                    if (this.previewBannerText) {
                        this.previewBannerText.innerHTML = `⚠️ Previsualizando versión antigua <strong>#${versionId}</strong> (Guardada el: ${formattedDate})`;
                    }
                }
                
                // Refresh UI
                this.renderAll();
                this.updateCategorySelect();
                this.showToast(`Mostrando versión #${versionId}`);
                
                // Switch tab to tasks to let the user see the state
                this.switchTab('tabTasks');
            } else {
                this.showToast('Error al descargar versión');
            }
        } catch (err) {
            console.error("Preview version error:", err);
            this.showToast('Error de red al cargar la versión');
        }
    }

    async restorePreviewedVersion() {
        if (!this.isPreviewMode || !this.loadedVersionId) return;
        if (confirm(`¿Estás seguro de que deseas restaurar la versión #${this.loadedVersionId} como el estado activo actual?`)) {
            try {
                // Exit preview mode so we can save
                this.isPreviewMode = false;
                
                // Trigger a save with description
                const description = `Restaurada versión #${this.loadedVersionId}`;
                
                // Call database save manually with description
                const response = await fetch('/api/data', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        tasks: this.tasks,
                        notes: this.notes,
                        servers: this.servers,
                        agenda: this.agendaDrafts,
                        categories: this.categories,
                        pendientes: this.pendientes,
                        trash: this.trash,
                        directory: this.directory,
                        files: this.files,
                        description: description
                    })
                });
                
                if (response.ok) {
                    this.showToast('Versión restaurada con éxito en la base de datos');
                    if (this.previewBanner) this.previewBanner.style.display = 'none';
                    
                    const resJson = await response.json();
                    if (resJson.versionId) {
                        this.currentVersionId = resJson.versionId;
                    }
                    
                    this.saveAndRefresh();
                } else {
                    this.isPreviewMode = true; // Rollback
                    this.showToast('Error al guardar la versión restaurada');
                }
            } catch (err) {
                this.isPreviewMode = true; // Rollback
                console.error("Restore error:", err);
                this.showToast('Error de red al restaurar');
            }
        }
    }

    async exitPreviewMode() {
        if (!this.isPreviewMode) return;
        this.isPreviewMode = false;
        if (this.previewBanner) this.previewBanner.style.display = 'none';
        this.showToast('Saliendo de la previsualización...');
        
        // Reload active data from server
        await this.loadAllData();
        this.renderAll();
        this.updateCategorySelect();
        this.showToast('Estado activo cargado');
    }


    // ============================================================
    // CENTRO DE MANDO -- The Bear (Mise en Place)
    // ============================================================

    updateCommandCenterClock() {
        const clockEl = document.getElementById('cmdClock');
        const dateEl  = document.getElementById('cmdDate');
        if (!clockEl) return;
        const now = new Date();
        clockEl.textContent = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true });
        if (dateEl) {
            dateEl.textContent = now.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
        }
    }

    renderCommandCenter() {
        const now   = new Date();
        const today = now.toLocaleDateString('sv-SE');
        this.updateCommandCenterClock();

        const phrases = [
            'Buenos dias. Revisa tu plan antes de comenzar.',
            'Todo bajo control. Aquí está el resumen ejecutivo.',
            'Jornada en curso. Mantente enfocado en lo prioritario.',
            'Revisa tus pendientes críticos antes de avanzar.',
            'Organiza tu tiempo. Cada hora cuenta.',
            'Flujo de trabajo activo. Sin interrupciones.',
            'Enfoque total. Prioriza, ejecuta, cierra.',
        ];
        const subtitle = document.getElementById('cmdSubtitle');
        if (subtitle) {
            const h = now.getHours();
            let greeting;
            if (h >= 6  && h < 12) greeting = phrases[0];
            else if (h >= 12 && h < 14) greeting = phrases[1];
            else if (h >= 14 && h < 16) greeting = phrases[2];
            else if (h >= 16 && h < 18) greeting = phrases[3];
            else if (h >= 18 && h < 20) greeting = phrases[4];
            else                        greeting = phrases[5];
            subtitle.textContent = greeting;
        }

        const fireItems    = [];
        const onItems      = [];
        const waitingItems = [];
        let   doneCount    = 0;

        this.tasks.forEach(t => {
            const isActive    = this.isTaskActiveToday(t, now);
            const isCompleted = this.isTaskCompletedToday(t, today);
            if (isCompleted) { doneCount++; return; }
            if (!isActive && t.status !== 'todo') return;
            if (t.priority === 'alta' || t.priority === 'urgente') {
                fireItems.push(t);
            } else if (t.dependencyType === 'area') {
                waitingItems.push(t);
            } else {
                onItems.push(t);
            }
        });

        const agendaItems = [];
        const nowMinutes  = now.getHours() * 60 + now.getMinutes();

        this.tasks.forEach(t => {
            if (!t.start) return;
            const startDate = new Date(t.start);
            if (startDate.toLocaleDateString('sv-SE') !== today) return;
            const startM  = startDate.getHours() * 60 + startDate.getMinutes();
            const endDate = t.end ? new Date(t.end) : new Date(startDate.getTime() + 3600000);
            const endM    = endDate.getHours() * 60 + endDate.getMinutes();
            if (endM < nowMinutes - 30) return;
            agendaItems.push(Object.assign({}, t, { _startM: startM, _endM: endM, _startDate: startDate, _endDate: endDate }));
        });
        agendaItems.sort((a, b) => a._startM - b._startM);

        const nextEventBlock = document.getElementById('cmdNextEventBlock');
        const nextEventName  = document.getElementById('cmdNextEventName');
        const nextEventTime  = document.getElementById('cmdNextEventTime');
        const upcoming = agendaItems.filter(e => e._startM >= nowMinutes);

        if (upcoming.length > 0 && nextEventBlock) {
            const next    = upcoming[0];
            const diffMin = next._startM - nowMinutes;
            nextEventBlock.style.display = 'block';
            nextEventName.textContent    = next.title;
            if (diffMin === 0) {
                nextEventTime.textContent = 'AHORA!';
                nextEventTime.style.color = '#ef4444';
            } else if (diffMin < 60) {
                nextEventTime.textContent = 'En ' + diffMin + ' min';
                nextEventTime.style.color = diffMin <= 15 ? '#ef4444' : '#f59e0b';
            } else {
                const h = Math.floor(diffMin / 60);
                const m = diffMin % 60;
                nextEventTime.textContent = 'En ' + h + 'h ' + (m > 0 ? m + 'min' : '');
                nextEventTime.style.color = '#f59e0b';
            }
        } else if (nextEventBlock) {
            nextEventBlock.style.display = 'none';
        }

        const totalToday   = fireItems.length + onItems.length + waitingItems.length + doneCount;
        const meetingCount = agendaItems.length;
        const progress     = totalToday > 0 ? Math.round((doneCount / totalToday) * 100) : 0;

        const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        setEl('metricTodayTasks', totalToday);
        setEl('metricMeetings',   meetingCount);
        setEl('metricCritical',   fireItems.length);
        setEl('metricDone',       doneCount);
        setEl('metricProgress',   progress + '%');
        const fill = document.getElementById('cmdProgressFill');
        if (fill) fill.style.width = progress + '%';

        const priorityLabels = { 'alta': 'Urgente', 'urgente': 'Urgente', 'media': 'Estandar', 'baja': 'Personal', 'trabajo': 'Trabajo' };

        const createTicket = (t, type) => {
            const pLabel   = priorityLabels[t.priority] || t.priority || 'Estandar';
            const pClass   = (t.priority === 'alta' || t.priority === 'urgente') ? 'badge-fire' : 'badge-media';
            const depHtml  = t.dependencyType === 'area'
                ? '<span class="cmd-ticket-badge badge-area">' + (t.dependencyArea || 'Area') + '</span>'
                : t.dependencyType === 'me' ? '<span class="cmd-ticket-badge badge-me">Yo</span>' : '';
            const catHtml  = t.category ? '<span class="cmd-ticket-badge badge-cat">' + t.category + '</span>' : '';
            const recHtml  = (t.recurrence && t.recurrence !== 'none') ? '<span class="cmd-ticket-badge badge-rec">Rec</span>' : '';
            return '<div class="cmd-ticket cmd-ticket-' + type + '" onclick="app.editTask(' + t.id + ')" title="' + t.title.replace(/"/g,"'") + '">'
                + '<div class="cmd-ticket-title">' + t.title + '</div>'
                + '<div class="cmd-ticket-meta"><span class="cmd-ticket-badge ' + pClass + '">' + pLabel + '</span>' + depHtml + catHtml + recHtml + '</div>'
                + '</div>';
        };

        const renderStation = (elId, countId, items, type, emptyMsg) => {
            const el  = document.getElementById(elId);
            const cEl = document.getElementById(countId);
            if (!el) return;
            if (cEl) cEl.textContent = items.length;
            el.innerHTML = items.length === 0
                ? '<div class="cmd-station-empty">' + emptyMsg + '</div>'
                : items.map(t => createTicket(t, type)).join('');
        };

        renderStation('cmdStationFire',    'cmd-count-fire',    fireItems,    'fire',    'Sin criticos. Clear!');
        renderStation('cmdStationOn',      'cmd-count-on',      onItems,      'on',      'Sin tareas activas.');
        renderStation('cmdStationWaiting', 'cmd-count-waiting', waitingItems, 'waiting', 'Sin bloqueos.');

        const agendaEl    = document.getElementById('cmdStationAgenda');
        const agendaCount = document.getElementById('cmd-count-agenda');
        if (agendaEl) {
            if (agendaCount) agendaCount.textContent = agendaItems.length;
            if (agendaItems.length === 0) {
                agendaEl.innerHTML = '<div class="cmd-station-empty">Sin reuniones hoy.</div>';
            } else {
                agendaEl.innerHTML = agendaItems.map(t => {
                    const ss = t._startDate.getHours().toString().padStart(2,'0') + ':' + t._startDate.getMinutes().toString().padStart(2,'0');
                    const es = t._endDate.getHours().toString().padStart(2,'0')   + ':' + t._endDate.getMinutes().toString().padStart(2,'0');
                    const isNow = nowMinutes >= t._startM && nowMinutes < t._endM;
                    return '<div class="cmd-ticket cmd-ticket-agenda" onclick="app.switchTab(\'tabAgenda\')" title="' + t.title.replace(/"/g,"'") + '">'
                        + '<div class="cmd-ticket-title">' + (isNow ? '[AHORA] ' : '') + t.title + '</div>'
                        + '<div class="cmd-ticket-meta"><span class="cmd-ticket-badge badge-time">' + ss + '-' + es + '</span>'
                        + (t.category ? '<span class="cmd-ticket-badge badge-meeting">' + t.category + '</span>' : '') + '</div></div>';
                }).join('');
            }
        }

        const tlEl = document.getElementById('cmdTimeline');
        if (tlEl) {
            const maxM    = nowMinutes + 8 * 60;
            const tlItems = [];
            tlItems.push({ type: 'now', minutes: nowMinutes, sub: now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true }) });

            agendaItems.forEach(t => {
                if (t._startM >= nowMinutes && t._startM <= maxM) {
                    const ss = t._startDate.getHours().toString().padStart(2,'0') + ':' + t._startDate.getMinutes().toString().padStart(2,'0');
                    tlItems.push({ type: (t.priority === 'alta' || t.priority === 'urgente') ? 'urgent' : 'meeting', minutes: t._startM, label: t.title, sub: ss, id: t.id });
                }
            });
            fireItems.forEach(t => {
                if (!t.start) return;
                const sd = new Date(t.start);
                const sm = sd.getHours() * 60 + sd.getMinutes();
                if (sm >= nowMinutes && sm <= maxM && !agendaItems.find(a => a.id === t.id)) {
                    const ss = sd.getHours().toString().padStart(2,'0') + ':' + sd.getMinutes().toString().padStart(2,'0');
                    tlItems.push({ type: 'urgent', minutes: sm, label: t.title, sub: ss, id: t.id });
                }
            });
            tlItems.sort((a, b) => a.minutes - b.minutes);

            if (tlItems.length <= 1) {
                tlEl.innerHTML = '<div class="cmd-empty-state">Sin eventos en las proximas 8 horas.</div>';
            } else {
                tlEl.innerHTML = tlItems.map(item => {
                    if (item.type === 'now') {
                        return '<div class="cmd-tl-row"><div class="cmd-tl-time">' + item.sub + '</div>'
                            + '<div class="cmd-tl-dot-wrap"><div class="cmd-tl-dot tl-dot-now"></div></div>'
                            + '<div class="cmd-tl-content"><div class="cmd-tl-now-line"><span class="cmd-tl-now-label">AHORA</span></div></div></div>';
                    }
                    const dc = item.type === 'urgent' ? 'tl-dot-urgent' : 'tl-dot-meeting';
                    const oc = item.id ? 'onclick="app.editTask(' + item.id + ')"' : '';
                    return '<div class="cmd-tl-row" ' + oc + ' style="cursor:' + (item.id ? 'pointer' : 'default') + '">'
                        + '<div class="cmd-tl-time">' + item.sub + '</div>'
                        + '<div class="cmd-tl-dot-wrap"><div class="cmd-tl-dot ' + dc + '"></div></div>'
                        + '<div class="cmd-tl-content"><div class="cmd-tl-label">' + item.label + '</div></div></div>';
                }).join('');
            }
        }

        const notesEl = document.getElementById('cmdCriticalNotes');
        if (notesEl) {
            const criticalNotes = this.notes.filter(n => n.importance >= 3);
            const iLabels = { 3: 'Alta', 4: 'Critica' };
            if (criticalNotes.length === 0) {
                notesEl.innerHTML = '<div class="cmd-empty-state">Sin notas criticas.</div>';
            } else {
                notesEl.innerHTML = criticalNotes
                    .sort((a, b) => (b.importance || 0) - (a.importance || 0))
                    .map(n => '<div class="cmd-note-card ' + (n.importance === 4 ? 'cmd-note-critical' : '') + '" onclick="app.switchTab(\'tabNotes\')">'
                        + '<div class="cmd-note-text">' + n.text + '</div>'
                        + '<div class="cmd-note-importance">' + (iLabels[n.importance] || 'Alta') + '</div></div>')
                    .join('');
            }
        }

        // ---- Break Recommendation ----
        const breakEl = document.getElementById('cmdBreakRec');
        if (breakEl) {
            const bh = now.getHours();
            const bm = now.getMinutes();
            const totalMin = bh * 60 + bm;

            const schedule = [
                { from: 370, to: 440, upcoming: 390, type: 'soon',  icon: 'upcoming', title: 'Pausa matutina recomendada',     desc: 'Lleva mas de 90 minutos activo. 10 minutos de descanso mejoran el enfoque.' },
                { from: 440, to: 760, upcoming: 780, type: 'soon',  icon: 'upcoming', title: 'Almuerzo en menos de 30 min',    desc: 'Finaliza la tarea en curso y prepara la pausa de mediodia.' },
                { from: 755, to: 780, upcoming: 780, type: 'soon',  icon: 'upcoming', title: 'Almuerzo en 15 minutos',         desc: 'Cierra actividades pendientes. La pausa de mediodia esta proxima.' },
                { from: 780, to: 840, upcoming: 780, type: 'lunch', icon: 'lunch',    title: 'Pausa de mediodia',              desc: 'Tiempo de almuerzo. Desconectarse 30-60 minutos mejora el rendimiento.' },
                { from: 940, to: 960, upcoming: 960, type: 'soon',  icon: 'upcoming', title: 'Pausa vespertina en 15 min',     desc: 'Recarga energias antes del bloque final de trabajo.' },
                { from: 960, to: 1020,upcoming: 960, type: 'now',   icon: 'now',      title: 'Pausa vespertina recomendada',   desc: '10 minutos de descanso para cerrar el dia con mayor efectividad.' },
                { from: 1110,to: 1440,upcoming: 1110,type: 'eod',   icon: 'eod',      title: 'Hora de desconectarse',          desc: 'Jornada laboral completada. Cierra actividades pendientes y desconectate.' },
            ];

            const iconMap = {
                upcoming: '<span class="cmd-break-icon">&#x23F0;</span>',
                now:      '<span class="cmd-break-icon">&#x2615;</span>',
                lunch:    '<span class="cmd-break-icon">&#x1F37D;</span>',
                eod:      '<span class="cmd-break-icon">&#x1F305;</span>',
            };
            const typeMap = { soon: 'cmd-break-soon', now: 'cmd-break-now', lunch: 'cmd-break-lunch', eod: 'cmd-break-eod' };

            const match = schedule.find(function(s) { return totalMin >= s.from && totalMin < s.to; });
            if (match) {
                const remaining = match.upcoming > totalMin ? match.upcoming - totalMin : 0;
                const cdHtml = remaining > 0
                    ? '<span class="cmd-break-countdown">En ' + remaining + ' min</span>'
                    : '<span class="cmd-break-countdown">Ahora</span>';
                breakEl.className = 'cmd-break-rec ' + (typeMap[match.type] || 'cmd-break-soon');
                breakEl.style.display = 'flex';
                breakEl.innerHTML = (iconMap[match.icon] || iconMap.now)
                    + '<div class="cmd-break-body">'
                    + '<div class="cmd-break-title">' + match.title + '</div>'
                    + '<div class="cmd-break-desc">' + match.desc + '</div>'
                    + '</div>' + cdHtml;
            } else {
                breakEl.style.display = 'none';
            }
        }

        // ---- Events Widget, Bat Widget and Quote Ticker ----
        this.renderEventsWidget();
        this.renderBatWidget();
        this.renderQuoteTicker();
    }


    // ============================================================
    // BITACORA DE EVENTOS
    // ============================================================

    openEventForm(id) {
        const modal = document.getElementById('eventFormModal');
        if (!modal) return;
        const now = new Date();
        if (id) {
            const ev = this.events.find(e => e.id === id);
            if (!ev) return;
            document.getElementById('eventId').value = ev.id;
            document.getElementById('eventFormTitle').textContent = 'Editar Evento';
            document.getElementById('eventType').value        = ev.type || 'falla';
            document.getElementById('eventImpact').value      = ev.impact || 'medio';
            document.getElementById('eventServer').value      = ev.server || '';
            document.getElementById('eventResponsible').value = ev.responsible || '';
            document.getElementById('eventDate').value        = ev.date || '';
            document.getElementById('eventTime').value        = ev.time || '';
            document.getElementById('eventDuration').value    = ev.duration || '';
            document.getElementById('eventDescription').value = ev.description || '';
            document.getElementById('eventStatus').value      = ev.status || 'resuelto';
        } else {
            document.getElementById('eventId').value = '';
            document.getElementById('eventFormTitle').textContent = 'Registrar Evento';
            document.getElementById('eventType').value        = 'falla';
            document.getElementById('eventImpact').value      = 'medio';
            document.getElementById('eventServer').value      = '';
            document.getElementById('eventResponsible').value = '';
            document.getElementById('eventDate').value        = now.toLocaleDateString('sv-SE');
            document.getElementById('eventTime').value        = now.toTimeString().slice(0,5);
            document.getElementById('eventDuration').value    = '';
            document.getElementById('eventDescription').value = '';
            document.getElementById('eventStatus').value      = 'resuelto';
        }
        modal.style.display = 'flex';
    }

    closeEventForm() {
        const modal = document.getElementById('eventFormModal');
        if (modal) modal.style.display = 'none';
    }

    generateFolio() {
        const year = new Date().getFullYear();
        const max  = this.events.reduce((acc, e) => {
            if (e.folio && e.folio.startsWith('REF-' + year + '-')) {
                const n = parseInt(e.folio.split('-')[2]) || 0;
                return Math.max(acc, n);
            }
            return acc;
        }, 0);
        return 'REF-' + year + '-' + String(max + 1).padStart(4, '0');
    }

    saveEvent() {
        const idVal = document.getElementById('eventId').value;
        const ev = {
            id:          idVal ? parseInt(idVal) : Date.now(),
            folio:       idVal ? (this.events.find(e => e.id === parseInt(idVal)) || {}).folio || this.generateFolio() : this.generateFolio(),
            type:        document.getElementById('eventType').value,
            impact:      document.getElementById('eventImpact').value,
            server:      document.getElementById('eventServer').value.trim(),
            responsible: document.getElementById('eventResponsible').value.trim(),
            date:        document.getElementById('eventDate').value,
            time:        document.getElementById('eventTime').value,
            duration:    document.getElementById('eventDuration').value.trim(),
            description: document.getElementById('eventDescription').value.trim(),
            status:      document.getElementById('eventStatus').value,
            createdAt:   idVal ? (this.events.find(e => e.id === parseInt(idVal)) || {}).createdAt || new Date().toISOString() : new Date().toISOString(),
        };
        if (!ev.server || !ev.description) {
            this.showToast('Completa Servidor y Descripcion para guardar.', 'warn');
            return;
        }
        if (idVal) {
            const idx = this.events.findIndex(e => e.id === parseInt(idVal));
            if (idx >= 0) this.events[idx] = ev;
        } else {
            this.events.unshift(ev);
        }
        localStorage.setItem('tm_events', JSON.stringify(this.events));
        this.closeEventForm();
        this.renderEvents();
        this.renderEventsWidget();
        this.showToast('Evento registrado: ' + ev.folio);
    }

    deleteEvent(id) {
        if (!confirm('Eliminar este evento de la bitacora?')) return;
        this.events = this.events.filter(e => e.id !== id);
        localStorage.setItem('tm_events', JSON.stringify(this.events));
        this.renderEvents();
        this.renderEventsWidget();
        this.showToast('Evento eliminado.');
    }

    generateEventReport(ev) {
        const typeLabels = { falla: 'FALLA / INCIDENTE', cambio: 'CAMBIO / RFC', mantenimiento: 'MANTENIMIENTO', otro: 'EVENTO' };
        const impactLabels = { critico: 'CRITICO', alto: 'ALTO', medio: 'MEDIO', bajo: 'BAJO' };
        const statusLabels = { abierto: 'ABIERTO', 'en-proceso': 'EN PROCESO', resuelto: 'RESUELTO' };
        const sep = '='.repeat(44);
        const parts = [
            sep,
            (ev.type === 'falla' ? 'FALLA' : ev.type === 'cambio' ? 'CAMBIO' : 'EVENTO') + ' | ' + ev.folio,
            sep,
            'Servidor    : ' + (ev.server || 'N/A'),
            'Fecha       : ' + (ev.date ? new Date(ev.date + 'T12:00:00').toLocaleDateString('es-MX', {day:'2-digit',month:'short',year:'numeric'}) : 'N/A') + '  ' + (ev.time || ''),
            'Impacto     : ' + (impactLabels[ev.impact] || ev.impact || 'N/A'),
            sep,
            'DESCRIPCION',
            ev.description || 'Sin descripcion.',
            sep,
            'Responsable : ' + (ev.responsible || 'N/A'),
            'Duracion    : ' + (ev.duration || 'N/A'),
            'Estado      : ' + (statusLabels[ev.status] || ev.status || 'N/A'),
            sep,
        ];
        return parts.join('\n');
    }

    copyEventReport(id) {
        const ev = this.events.find(e => e.id === id);
        if (!ev) return;
        const report = this.generateEventReport(ev);
        navigator.clipboard.writeText(report).then(() => {
            this.showToast('Reporte copiado al portapapeles.');
        }).catch(() => {
            prompt('Copia el reporte:', report);
        });
    }

    filterEvents(btn, filter) {
        this.eventFilter = filter;
        document.querySelectorAll('.evt-filter-btn').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        this.renderEvents();
    }

    renderEvents() {
        const el = document.getElementById('eventsList');
        if (!el) return;

        const typeIcon = { falla: 'FALLA', cambio: 'CAMBIO', mantenimiento: 'MTTO', otro: 'OTRO' };
        const impactColors = { critico: 'impact-critico', alto: 'impact-alto', medio: 'impact-medio', bajo: 'impact-bajo' };
        const typeColors   = { falla: 'evt-falla', cambio: 'evt-cambio', mantenimiento: 'evt-mantenimiento', otro: 'evt-otro' };
        const typeBadge    = { falla: 'badge-falla', cambio: 'badge-cambio', mantenimiento: 'badge-mantenimiento', otro: 'badge-otro' };

        const filtered = this.eventFilter === 'all'
            ? this.events
            : this.events.filter(e => e.type === this.eventFilter);

        if (filtered.length === 0) {
            el.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-secondary); font-size:0.85rem;">Sin eventos registrados. Presiona + Nuevo Evento para comenzar.</div>';
            this.renderEventsWidget();
            return;
        }

        el.innerHTML = filtered.map(ev => {
            const dateStr = ev.date ? new Date(ev.date + 'T12:00:00').toLocaleDateString('es-MX', {day:'2-digit',month:'short',year:'numeric'}) : '';
            return '<div class="event-card ' + (typeColors[ev.type] || '') + '">'
                + '<div class="event-card-top">'
                + '<span class="event-folio">' + ev.folio + '</span>'
                + '<span class="event-type-badge ' + (typeBadge[ev.type] || '') + '">' + (typeIcon[ev.type] || 'EVENTO') + '</span>'
                + '<span class="event-impact-badge ' + (impactColors[ev.impact] || 'impact-medio') + '">' + (ev.impact || 'medio').toUpperCase() + '</span>'
                + '</div>'
                + '<div class="event-title">' + (ev.server || 'Servidor') + '</div>'
                + '<div class="event-meta">'
                + (dateStr ? '<span>📅 ' + dateStr + ' ' + (ev.time || '') + '</span>' : '')
                + (ev.responsible ? '<span>👤 ' + ev.responsible + '</span>' : '')
                + (ev.duration ? '<span>⏱ ' + ev.duration + '</span>' : '')
                + '<span class="' + (ev.status === 'resuelto' ? 'badge-media' : 'badge-fire') + '" style="border-radius:10px;padding:1px 8px;font-size:0.66rem;">' + ev.status.toUpperCase() + '</span>'
                + '</div>'
                + '<div class="event-desc">' + (ev.description || '') + '</div>'
                + '<div class="event-actions">'
                + '<button class="btn btn-secondary btn-small" onclick="app.copyEventReport(' + ev.id + ')">📋 Copiar Reporte</button>'
                + '<button class="btn btn-secondary btn-small" onclick="app.openEventForm(' + ev.id + ')">✏️ Editar</button>'
                + '<button class="btn btn-danger btn-small" onclick="app.deleteEvent(' + ev.id + ')">🗑</button>'
                + '</div>'
                + '</div>';
        }).join('');

        this.renderEventsWidget();
    }

    renderEventsWidget() {
        const el = document.getElementById('cmdEventsWidget');
        if (!el) return;
        const dotColors = { falla: '#ef4444', cambio: '#f59e0b', mantenimiento: '#6366f1', otro: '#94a3b8' };
        const last3 = this.events.slice(0, 3);
        if (last3.length === 0) {
            el.innerHTML = '<div class="cmd-event-row" style="color:var(--text-secondary);font-size:0.75rem;padding:10px 12px;">Sin eventos recientes.</div>';
            return;
        }
        el.innerHTML = last3.map(ev => {
            const dateStr = ev.date ? new Date(ev.date + 'T12:00:00').toLocaleDateString('es-MX', {day:'2-digit', month:'short'}) : '';
            return '<div class="cmd-event-row" onclick="app.switchTab(\'tabEvents\')" title="' + ev.folio + '">'
                + '<div class="cmd-event-dot" style="background:' + (dotColors[ev.type] || '#94a3b8') + ';"></div>'
                + '<div class="cmd-event-info">'
                + '<div class="cmd-event-server">' + (ev.server || 'N/A') + '</div>'
                + '<div class="cmd-event-date">' + ev.folio + ' &bull; ' + dateStr + ' ' + (ev.time || '') + '</div>'
                + '</div>'
                + '</div>';
        }).join('');
    }

    // ============================================================
    // EJECUTOR .BAT
    // ============================================================

    saveBatConfig() {
        this.batConfig = {
            batPath:   (document.getElementById('batPath')   || {}).value || '',
            outputDir: (document.getElementById('batOutputDir') || {}).value || '',
            timeout:   parseInt((document.getElementById('batTimeout') || {}).value) || 60,
            files: [
                (document.getElementById('batFile1') || {}).value || '',
                (document.getElementById('batFile2') || {}).value || '',
                (document.getElementById('batFile3') || {}).value || '',
            ]
        };
        localStorage.setItem('tm_bat_config', JSON.stringify(this.batConfig));
        // Show widget if bat path configured
        const panel = document.getElementById('cmdBatPanel');
        if (panel) panel.style.display = this.batConfig.batPath ? 'block' : 'none';
    }

    toggleBatConfig() {
        const body = document.getElementById('batConfigBody');
        const icon = document.getElementById('batConfigToggleIcon');
        if (!body) return;
        const isHidden = body.style.display === 'none';
        body.style.display = isHidden ? 'flex' : 'none';
        if (icon) icon.textContent = isHidden ? '▲' : '▼';
    }

    renderBatRunner() {
        // Populate config fields from saved config
        const fields = {
            batPath:      document.getElementById('batPath'),
            batOutputDir: document.getElementById('batOutputDir'),
            batTimeout:   document.getElementById('batTimeout'),
            batFile1:     document.getElementById('batFile1'),
            batFile2:     document.getElementById('batFile2'),
            batFile3:     document.getElementById('batFile3'),
        };
        if (fields.batPath)      fields.batPath.value      = this.batConfig.batPath || '';
        if (fields.batOutputDir) fields.batOutputDir.value = this.batConfig.outputDir || '';
        if (fields.batTimeout)   fields.batTimeout.value   = this.batConfig.timeout || 60;
        if (fields.batFile1)     fields.batFile1.value     = (this.batConfig.files || [])[0] || '';
        if (fields.batFile2)     fields.batFile2.value     = (this.batConfig.files || [])[1] || '';
        if (fields.batFile3)     fields.batFile3.value     = (this.batConfig.files || [])[2] || '';

        // Restore last output if exists
        if (this.batOutput) this._displayBatOutput(this.batOutput);
    }

    async runBatFile() {
        if (this.batRunning) return;
        if (!this.batConfig.batPath) {
            this.showToast('Configura la ruta del script primero.', 'warn');
            return;
        }
        this.batRunning = true;
        this._setBatStatus('running', '⏳ Ejecutando script... por favor espera.');

        const btn = document.getElementById('btnRunBat');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Ejecutando...'; }

        try {
            const resp = await fetch('/api/run-bat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    batPath:     this.batConfig.batPath,
                    outputDir:   this.batConfig.outputDir,
                    outputFiles: (this.batConfig.files || []).filter(f => f.trim()),
                    timeout:     (this.batConfig.timeout || 60) * 1000
                })
            });
            const result = await resp.json();
            this.batOutput = result;
            this._displayBatOutput(result);
            this.renderBatWidget();
            if (result.success) {
                this._setBatStatus('ok', '✅ Script ejecutado en ' + (result.executionTime / 1000).toFixed(1) + 's — ' + new Date(result.timestamp).toLocaleTimeString('es-MX'));
            } else {
                this._setBatStatus('error', '❌ Error: ' + (result.error || 'Script retorno error'));
            }
        } catch (e) {
            this._setBatStatus('error', '❌ Error de conexion con el servidor: ' + e.message + '. Asegurate de que el servidor Node esta corriendo.');
        } finally {
            this.batRunning = false;
            if (btn) { btn.disabled = false; btn.textContent = '▶ Ejecutar Script'; }
        }
    }

    async runBatFromWidget() {
        if (this.isOffline) {
            this.showToast('El ejecutor requiere conexion con el servidor Node.', 'warn');
            return;
        }
        await this.runBatFile();
    }

    _setBatStatus(type, msg) {
        const bar = document.getElementById('batStatusBar');
        if (!bar) return;
        bar.style.display = 'block';
        bar.className = 'bat-status-bar bat-status-' + type;
        bar.textContent = msg;
    }

    _displayBatOutput(result) {
        const area = document.getElementById('batOutputArea');
        const empty = document.getElementById('batEmptyState');
        const tabsEl = document.getElementById('batOutputTabs');
        const textEl = document.getElementById('batOutputText');
        if (!area || !tabsEl || !textEl) return;

        const files = result.files || [];
        const validFiles = files.filter(f => f && f.name);

        if (validFiles.length === 0 && !result.stdout) {
            if (area) area.style.display = 'none';
            if (empty) empty.style.display = 'block';
            return;
        }

        if (area) area.style.display = 'block';
        if (empty) empty.style.display = 'none';

        // If no named files, show stdout
        const tabs = validFiles.length > 0 ? validFiles : [{ name: 'Salida', content: result.stdout || result.stderr || 'Sin salida.', ok: true }];

        if (this.batActiveTab >= tabs.length) this.batActiveTab = 0;

        tabsEl.innerHTML = tabs.map((f, i) =>
            '<button class="bat-tab-btn ' + (i === this.batActiveTab ? 'active' : '') + ' ' + (f.ok === false ? 'error' : 'ok') + '" onclick="app.selectBatTab(' + i + ')">'
            + f.name + (f.ok === false ? ' ⚠' : '') + '</button>'
        ).join('');

        const activeFile = tabs[this.batActiveTab];
        textEl.textContent = activeFile.content !== null ? activeFile.content : ('Error al leer: ' + activeFile.error);
    }

    selectBatTab(idx) {
        this.batActiveTab = idx;
        if (this.batOutput) this._displayBatOutput(this.batOutput);
    }

    copyBatOutput() {
        const textEl = document.getElementById('batOutputText');
        if (!textEl) return;
        navigator.clipboard.writeText(textEl.textContent).then(() => {
            this.showToast('Contenido copiado al portapapeles.');
        });
    }

    renderBatWidget() {
        const widgetEl = document.getElementById('cmdBatWidget');
        const panel    = document.getElementById('cmdBatPanel');
        if (!widgetEl) return;
        if (!this.batConfig || !this.batConfig.batPath) {
            if (panel) panel.style.display = 'none';
            return;
        }
        if (panel) panel.style.display = 'block';
        if (!this.batOutput) {
            widgetEl.innerHTML = '<span style="color:var(--text-secondary)">Sin ejecuciones. Presiona ▶ Ejecutar.</span>';
            return;
        }
        const ts  = this.batOutput.timestamp ? new Date(this.batOutput.timestamp).toLocaleString('es-MX', { dateStyle:'short', timeStyle:'short' }) : '';
        const ok  = this.batOutput.success;
        const cnt = (this.batOutput.files || []).filter(f => f.ok).length;
        widgetEl.innerHTML = '<span style="color:' + (ok ? '#34d399' : '#ef4444') + '">' + (ok ? '✅' : '❌') + '</span>'
            + ' <span style="font-size:0.76rem;">' + cnt + ' archivo(s) leidos &bull; ' + ts + '</span>';
    }

    // ============================================================
    // QUOTE TICKER
    // ============================================================

    getQuotes() {
        return [
            // Harvey Specter
            { text: 'I don\'t have dreams, I have goals.', cat: 'Harvey Specter', icon: '🧠' },
            { text: 'Winners don\'t make excuses when the other side plays the game.', cat: 'Harvey Specter', icon: '🧠' },
            { text: 'The only time success comes before work is in the dictionary.', cat: 'Harvey Specter', icon: '🧠' },
            { text: 'It\'s not bragging if it\'s true.', cat: 'Harvey Specter', icon: '🧠' },
            { text: 'When you\'re backed against the wall, break the goddamn thing down.', cat: 'Harvey Specter', icon: '🧠' },
            { text: 'Anyone can do my job, but no one can be me.', cat: 'Harvey Specter', icon: '🧠' },
            { text: 'I\'m not the one who has to make things right. I\'m the one who has to get things done.', cat: 'Harvey Specter', icon: '🧠' },
            // Motivacionales
            { text: 'La disciplina es hacer lo que necesitas hacer, incluso cuando no quieres hacerlo.', cat: 'Motivacional', icon: '💡' },
            { text: 'El exito es la suma de pequenos esfuerzos repetidos dia tras dia.', cat: 'Motivacional', icon: '💡' },
            { text: 'Una meta sin plan es solo un deseo.', cat: 'Motivacional', icon: '💡' },
            { text: 'No cuentes los dias. Haz que los dias cuenten.', cat: 'Motivacional', icon: '💡' },
            { text: 'El trabajo duro supera al talento cuando el talento no trabaja duro.', cat: 'Motivacional', icon: '💡' },
            { text: 'La excelencia no es un acto, es un habito.', cat: 'Motivacional', icon: '💡' },
            { text: 'Lo que no se mide, no se mejora.', cat: 'Motivacional', icon: '💡' },
            { text: 'Organiza tu tiempo como si fuera tu recurso mas valioso, porque lo es.', cat: 'Motivacional', icon: '💡' },
            // Catholicas
            { text: 'Todo lo puedo en Cristo que me fortalece. — Fil 4:13', cat: 'Espiritual', icon: '✝️' },
            { text: 'Ora et labora. — San Benito', cat: 'Espiritual', icon: '✝️' },
            { text: 'No temas, porque yo estoy contigo. — Is 41:10', cat: 'Espiritual', icon: '✝️' },
            { text: 'El que trabaja honestamente colabora con el plan de Dios para la humanidad. — Juan Pablo II', cat: 'Espiritual', icon: '✝️' },
            { text: 'Ora como si todo dependiera de Dios. Trabaja como si todo dependiera de ti. — San Ignacio', cat: 'Espiritual', icon: '✝️' },
            { text: 'La fe sin obras es fe muerta. — Santiago 2:26', cat: 'Espiritual', icon: '✝️' },
            { text: 'Encomienda tus obras al Senor y tus planes se realizaran. — Prov 16:3', cat: 'Espiritual', icon: '✝️' },
        ];
    }

    renderQuoteTicker() {
        const track = document.getElementById('cmdTickerTrack');
        const iconEl = document.getElementById('cmdTickerIcon');
        const textEl = document.getElementById('cmdTickerText');
        if (!track || !textEl) return;

        const quotes = this.getQuotes();
        const pick   = quotes[Math.floor(Math.random() * quotes.length)];

        if (iconEl) iconEl.textContent = pick.icon;

        // Duplicate text for seamless loop
        const catHtml  = '<span class="cmd-ticker-category">' + pick.cat + '</span>';
        const quoteHtml = pick.text + '   \u2014   ' + pick.text;
        textEl.innerHTML = catHtml + quoteHtml;

        // Restart animation
        track.style.animation = 'none';
        track.offsetHeight; // reflow
        track.style.animation = 'tickerScroll 40s linear infinite';

        // Schedule next quote change
        if (this.quoteTimerId) clearTimeout(this.quoteTimerId);
        this.quoteTimerId = setTimeout(() => this.renderQuoteTicker(), 45000);
    }

}

const app = new TaskMaster();