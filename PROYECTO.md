# Daily Task Hub (TaskMaster)

Este proyecto es una aplicación web de productividad todo-en-uno, diseñada para funcionar de forma local (Offline-first) mediante el almacenamiento del navegador (IndexedDB / LocalStorage) y con la capacidad de respaldar versiones en un servidor backend (Oracle DB). 

La aplicación se caracteriza por una interfaz moderna con efectos *Glassmorphism*, diseño responsivo, soporte nativo para Modo Oscuro/Claro y herramientas avanzadas de organización.

## 🛠️ Tecnologías Principales
*   **HTML5 & CSS3 (Vanilla):** Estructura semántica y diseño sin frameworks externos. Uso intensivo de CSS Grid, Flexbox y variables CSS para el manejo de temas.
*   **JavaScript (Vanilla JS):** Toda la lógica de estado, *Drag & Drop*, manejo de fechas, promesas y peticiones asíncronas está construida sin librerías pesadas.
*   **Almacenamiento Local:** Uso de `localStorage` para preferencias y estado, y de `IndexedDB` (a través de la clase `StorageDB`) para almacenar archivos pesados y datos estructurados de manera eficiente.
*   **Chart.js:** Utilizado opcionalmente si se requiere renderizado de gráficas (importado vía CDN).

---

## 🚀 Módulos y Funcionalidades

### 1. 📋 Mi Día: Actividades
Gestor de tareas avanzado basado en columnas tipo Kanban.
*   **Cubetas / Columnas:**
    *   **Próximamente (Backlog):** Tareas sin fecha o planeadas a futuro.
    *   **Por Hacer Hoy:** Tareas asignadas para el día actual.
    *   **Completados Hoy:** Tareas finalizadas en la jornada. *Nota: Las actividades de una sola vez completadas solo se muestran en la fecha de su completado; al día siguiente desaparecen automáticamente para mantener el espacio de trabajo limpio.*
*   **Características de la Tarea:**
    *   Título, Prioridad (Urgente, Media, Personal, Trabajo) y Categoría.
    *   Fechas de inicio y fin proyectado.
    *   **Dependencia / Responsable:** Leyenda personalizable que indica si la actividad depende de mí (`🙋 Depende de mí`) o de otra área/responsable específica (`🏢 <Nombre del área>`).
    *   **Recurrencia Avanzada:** Repetición diaria, días laborales, semanal (eligiendo días), mensual (ej. "el día 15" o "el primer lunes") y anual.
    *   **Bitácora / Historial:** Registro manual de pasos con marca de tiempo automática para auditar el avance.
*   **Captura Rápida:** Barra de texto para añadir tareas instantáneas al día de hoy (por defecto asignadas a "Depende de mí").

### 1.1 🌳 Mi Día: Lista Jerárquica
Visualización y control estructurado de actividades diarias con anidación multinivel.
*   **Captura en Bloque:** Procesador inteligente que traduce texto con indentación (tabuladores o espacios) a una estructura jerárquica de tareas y subtareas instantáneamente.
*   **Completado Recursivo:** Marcar una tarea principal autocompleta recursivamente todas sus subtareas hijas.
*   **Gestión Rápida:** Posibilidad de crear subtareas interactivamente desde cualquier nivel del árbol, editar títulos en línea y eliminar elementos.
*   **Exportación y Compartido:**
    *   **Copiar para Correo:** Copia instantáneamente la estructura del árbol a texto formateado en el portapapeles con sangrías y marcas de estado `[ ]` o `[x]` (incluyendo leyendas de dependencia) idóneo para pegar directamente en un correo.
    *   **Exportar Imagen:** Renderiza visualmente la lista jerárquica utilizando la librería `html2canvas` para descargar una captura PNG de alta resolución lista para adjuntar.

### 1.2 🐻 Mi Día: Centro de Mando (The Bear)
Dashboard operacional diario inspirado en el sistema de control visual de la serie *The Bear* (T2E10).
Ofrece un resumen en tiempo real del día con colores semáforo por tipo/urgencia, sin necesidad de navegar entre pestañas.
*   **Sistema de Colores / Estaciones (Mise en Place):**
    *   **🔴 FIRE (Rojo):** Tareas con prioridad Urgente que requieren atención inmediata. El punto parpadea con animación de pulso.
    *   **🟡 AGENDA (Amarillo):** Reuniones y eventos agendados para hoy con hora de inicio y fin.
    *   **🟢 ON STATION (Verde):** Tareas activas de hoy donde la responsabilidad es del propio usuario.
    *   **🔵 ESPERANDO (Azul/Morado):** Tareas bloqueadas en espera de otra área o responsable externo.
*   **Métricas del Día:** Panel con 5 contadores: Tareas de Hoy, Reuniones, Críticas/Fire, Completadas y % de Progreso con barra visual.
*   **Timeline de 8 Horas:** Línea de tiempo vertical con indicador "AHORA" en rojo, eventos próximos con puntos de color y navegación rápida por clic.
*   **Próximo Evento:** En la cabecera se muestra el nombre del próximo evento y un contador regresivo en minutos/horas, en rojo si es en menos de 15 minutos.
*   **Notas Críticas:** Panel lateral que filtra automáticamente solo las notas de importancia Alta o Crítica del tablero de Ideas y Recados.
*   **Frases corporativas por bloque horario:** El subtitulo cambia segun la hora con mensajes profesionales (Buenos dias. Revisa tu plan..., Enfoque total. Prioriza, ejecuta, cierra., etc.).
*   **Reloj en tiempo real:** Actualizado cada segundo con hora y fecha actual.
*   **Refresco automatico:** Los datos se actualizan cada 60 segundos si la pestana esta activa; hacer clic en cualquier tarjeta ticket abre la tarea directamente.
*   **Banner de descanso inteligente:** Recomendacion visual contextual segun el horario laboral:
    *   Pausa matutina (~10:30 h) - tras el primer bloque de trabajo de 90 minutos.
    *   Almuerzo (13:00-14:00 h) - con cuenta regresiva desde los 15 minutos previos.
    *   Pausa vespertina (~16:00 h) - antes del bloque final de trabajo.
    *   Desconexion (18:30+ h) - senal de cierre de jornada laboral.
*   **Vista por defecto:** El Centro de Mando es la pantalla inicial al abrir la aplicacion.

### 1.3 📡 Bitácora de Eventos (Fallas / Cambios)
Registro formal de incidentes, cambios y mantenimientos de infraestructura TI.
*   **Formulario de Registro en Modal:** Ventana modal flotante centrada con overlay oscuro desenfocado (`backdrop-filter: blur`), animación suave de apertura, soporte para cierre con tecla `Escape` o clic exterior. Captura Tipo (Falla/Cambio/Mantenimiento), Servidor/Sistema, Fecha, Hora, Descripción, Impacto, Responsable, Duración y Estado. Cuenta con cabecera y pie de acciones (`Cancelar` / `Guardar`) anclados y scroll interno en el cuerpo para evitar que se corten los botones en cualquier resolución de pantalla.
*   **Folio Automático:** Genera secuencialmente el número de referencia REF-YYYY-NNNN por año.
*   **Código de Color por Tipo:** Borde rojo para fallas, amarillo para cambios, azul para mantenimiento.
*   **Reporte Copiable:** Botón "📋 Copiar Reporte" que genera un bloque de texto estructurado listo para pegar en correo o ticket.
*   **Widget en Centro de Mando:** Los últimos 3 eventos aparecen en una tarjeta del dashboard con folio, servidor y fecha.
*   **Filtros rápidos:** Todos / Fallas / Cambios / Mantenimiento.

### 1.4 ⚙️ Ejecutor de Scripts (.bat)
Ejecución de scripts externos desde la interfaz y visualización de resultados en el dashboard.
*   **Configuración en UI:** Ruta del .bat, carpeta de salida, nombre de hasta 3 archivos .txt y timeout — guardado en localStorage, sin tocar el .env.
*   **Ejecución via Backend:** El servidor Node.js ejecuta el script con child_process.exec y lee los archivos .txt de salida.
*   **Visualización con Pestañas:** Los 3 archivos de salida se muestran en pestañas independientes con contenido scrolleable en fuente monoespaciada.
*   **Widget en Centro de Mando:** Si hay un .bat configurado, aparece un panel con botón ▶ Ejecutar y el estado de la última ejecución.
*   **Endpoints:** POST /api/run-bat (ejecuta y retorna contenido), GET /api/bat-last (último resultado cacheado).

### 1.5 🎬 Cinta de Frases (Ticker)
Barra deslizante al pie del Centro de Mando con frases de inspiración y motivación.
*   **Categorías mezcladas:** Harvey Specter, frases motivacionales corporativas y frases católicas/espirituales.
*   **Animación CSS continua:** Scrolling horizontal suave que se pausa al hacer hover.
*   **Rotación automática:** Nueva frase cada 45 segundos con reinicio de animación.
*   **Ícono por categoría:** 🧠 Harvey Specter · 💡 Motivacional · ✝️ Espiritual.

### 2. 📅 Mi Día: Agenda (Time-blocking) y Periodicidad de Actividades
Planificador visual diario organizado por horas y motor de repetición avanzada.
*   **Drag & Drop:** Puedes arrastrar tareas desde tu *Backlog* directamente a un bloque de hora en la agenda.
*   **Pomodoro Integrado:** Temporizador (25 min de trabajo / 5 min de descanso) accesible desde la cabecera para mantener la concentración.
*   **Pop-up de Recordatorio de Reunión Persistente (Estilo Teams & Outlook):** Notificación visual flotante y sonora que se activa al iniciar un evento o tarea programada. Permanece visible de forma continua en pantalla hasta que el usuario hace clic explícito en el botón **"Descartar"** o **"Completar"**, guardando el estado descartado en `localStorage`.
*   **Periodicidad y Recurrencia Avanzada (Personalizada):**
    *   Soporte para repetición diaria, semanal, cada día laborable (L-V), mensual, anual o personalizada con intervalo configurable.
    *   **Configuración Personalizada por Días de la Semana:** Modal avanzado para seleccionar días específicos (ej. Lunes, Martes, Miércoles y Jueves) con intervalo en semanas o días, fecha de inicio y fin opcional.
    *   **Indicador Visual / Badge en Formulario de Tarea:** Al configurar una periodicidad personalizada, se muestra un badge interactivo en el formulario de la tarea (`🔁 Cada semana los L, M, X, J`) acompañado de un botón `✏️ Modificar` que reabre el modal con todos los días y valores previamente guardados ya preseleccionados.
    *   **Evaluación de Calendario Precisa:** Motor de cálculo por semanas de calendario exactas y días de la semana (`isTaskActiveToday`), asegurando que la actividad se active automáticamente en la agenda y vistas de tareas en todos los días programados.
    *   **Submodal de Periodicidad Aislado y Protección de Datos:** El cierre de la ventana de periodicidad (mediante su botón `✕` superior, clic en el fondo o tecla `Escape`) se aísla por completo para cerrar únicamente dicho submodal, manteniendo intactos todos los datos previamente capturados en el formulario de la tarea sin reiniciarlo.
    *   **Diseño Consistente y Limpio:** Se eliminó el botón de cancelar redundante en el pie del modal de periodicidad para conservar exclusivamente la `✕` en la esquina superior (alineado al patrón del resto de modales como *Nueva Actividad*) y un botón principal de acción completa (*"Guardar Periodicidad"*).
    *   **Sincronización Automática de Fecha Inicial:** Al guardar la tarea, la fecha base de la recurrencia se sincroniza de forma automática con la fecha de inicio de la actividad (`task.start`), previniendo desfases en los que la periodicidad comenzaba en una fecha posterior y ocultaba apariciones previas.
    *   **Persistencia Completa:** Los objetos de periodicidad se almacenan tanto en IndexedDB/localStorage como en Oracle Database (CLOB JSON) de manera íntegra.

---

### 3. 💡 Gestión: Ideas y Recados
Tablero tipo Kanban para notas rápidas.
*   Clasificación por **Importancia** (Baja, Media, Alta, Crítica).
*   Personalización con colores visuales (Amarillo, Azul, Verde, Morado, Rosa).
*   Posibilidad de establecer un recordatorio/fecha.
*   Las notas se pueden arrastrar entre columnas de importancia.

### 4. 📂 Gestión: Documentos
Gestor de archivos integrado dentro de la base de datos local.
*   Soporte para subir archivos de hasta 10MB (almacenados en formato Base64).
*   **Zona de Drop:** Arrastrar y soltar archivos para subirlos.
*   **Vista Tabular:** Nombre, tamaño, fecha de subida y miniaturas inteligentes (36x36px) para imágenes.
*   Filtros rápidos (Todos, Imágenes, PDF, Word, Excel, PowerPoint).
*   Opciones para previsualizar imágenes y PDFs directamente en la app, o descargarlos.

### 5. 📞 Gestión: Directorio Telefónico
Libreta de contactos orientada a proveedores o soporte.
*   Almacena Nombre, Teléfono, Correo, Notas y Acciones de Soporte.
*   Barra de búsqueda en tiempo real.

### 6. 🔒 Seguridad: Server Vault
Bóveda segura para almacenar credenciales e información técnica de servidores.
*   Campos para IP, Hostname, Aplicación, Base de Datos, Usuario y Contraseñas (Actual y Anterior).
*   Etiquetas para Entorno (Desarrollo, QA, Producción) y tecnologías (Oracle, JBoss).
*   Sección de Notas largas que se pueden copiar al portapapeles.
*   Botón de visibilidad de contraseñas.

### 7. 🔑 Seguridad: Contraseñas
Gestor de contraseñas personales y corporativas.
*   Protegido por una **Contraseña Maestra** que bloquea la vista hasta ser introducida.
*   Almacena Plataforma/URL, Usuario, Contraseña y Notas.

### 8. 📜 Sistema: Versiones y Backup
Gestor de persistencia de datos.
*   **Exportar/Importar (JSON):** Descargar toda la base de datos local como un archivo JSON físico y restaurarlo en otra máquina.
*   **Sincronización en la Nube y Persistencia Activa:**
    *   **Persistencia en tiempo real (`PUT /api/data`):** Cualquier modificación, creación o eliminación de tareas se sincroniza automáticamente de forma inmediata en la base de datos Oracle DB en segundo plano (`keepalive: true`), actualizando el registro de estado activo para que al recargar la página (`F5`) los elementos eliminados permanezcan eliminados y no reaparezcan.
    *   **Puntos de Versión Manuales (`POST /api/data`):** El botón de "Nube" genera un punto de respaldo histórico (`versionId`) con descripción en la tabla `taskmaster_state`.
*   **Historial de Versiones:** Permite ver versiones antiguas, previsualizarlas (modo *Read-Only* temporal con banner naranja) y restaurarlas si es necesario.
*   **Indicador Interactivo y Reconexión Automática a Oracle DB:**
    *   Indicador visual en tiempo real en la cabecera ("Conectado" / "Offline (Reconectar)").
    *   Al estar en modo Offline, al hacer clic en el botón de estado o en la acción de guardar en Nube, el sistema intenta restablecer la conexión con Oracle DB mediante `/api/reconnect`.
    *   El servidor Node (`server.js`) ejecuta reintentos de reconexión automáticos en segundo plano cada 20 segundos y proporciona diagnósticos detallados en consola ante errores de red (ej. `ECONNREFUSED`, `ETIMEDOUT`, contraseñas o listeners detenidos).
    *   El cliente en navegador detecta automáticamente cuando la BD vuelve a estar en línea (vía `/api/db-status`) y resincroniza el estado.
*   **Búsqueda Dinámica de Puertos:** Si el puerto inicial configurado (por defecto `3000` o la variable de entorno `PORT`) está ocupado, el servidor busca de forma recursiva y secuencial el siguiente puerto libre para iniciarse sin errores.

### 9. 🗑️ Sistema: Papelera
Protección contra borrado accidental.
*   Cualquier tarea, nota, servidor o documento eliminado va a la papelera (Soft delete).
*   Se pueden restaurar elementos individualmente o hacer un vaciado permanente (*Hard delete*).

---

## 🎨 Resumen de la UI/UX
*   **Estandarización de Botones:** Botones principales en azul vibrante (`.btn-primary`), botones secundarios con bordes (`.btn-secondary`) y acciones destructivas en rojo (`.btn-danger`), todos con paddings consistentes.
*   **Navegación Lateral (Sidebar):** Menú fijo a la izquierda organizando las 9 pestañas principales (incluida la nueva Lista Jerárquica), maximizando el espacio vertical para evitar el solapamiento.
*   **Estatus y Backups en Cabecera:** El estatus de la base de datos (Offline/Conectado) junto con los botones de "Nube" y "Exportar" se ubican en la barra superior de acciones, manteniéndolos siempre accesibles sin restar espacio al menú.
*   **Generador de Correo (Resumen del Día):** Botón `📊` que recopila dinámicamente las tareas pendientes de "Por Hacer Hoy" y genera un texto pre-formateado en viñetas con sus respectivas leyendas de dependencia (ej. `(Depende de mí)`, `(Depende de: Sistemas)`), listo para pegarse en un reporte por correo electrónico para el jefe.
*   **Favicon Personalizado (SVG):** Se implementó un favicon dinámico mediante un SVG inline que muestra el logo característico del rayo (`⚡`) en blanco sobre un fondo redondeado con degradado moderno de azul a morado, garantizando una identidad visual única para evitar confusiones de puertos o caché en el navegador.
*   **Contraste Consistente de Selectores:** Se estilizaron las opciones nativas (`select option`) para sincronizar sus colores con el tema actual (`--side-nav-bg` y `--text-primary`), evitando la pérdida de legibilidad de las opciones en modo oscuro debido a los estilos de selección por defecto de los navegadores.
*   **Indicador de Actividad en Curso y Recordatorio Persistente (Teams/Outlook):** Implementación de un banner dinámico superior y un cuadro flotante interactivo en la esquina inferior derecha estilo Microsoft Teams/Outlook. Cuando inicia un evento de la agenda o tarea programada, suena la campanilla doble (Web Audio API) y el aviso **se mantiene fijo y persistente en pantalla sin desaparecer automáticamente**, requiriendo que el usuario presione explícitamente el botón **"Descartar"** (o "Descartar Todos" si hay múltiples eventos) o **"✓ Completar"**.
