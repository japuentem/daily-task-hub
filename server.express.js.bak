const express = require('express');
const oracledb = require('oracledb');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

dotenv.config();

const app = express();
const port = parseInt(process.env.PORT, 10) || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

let pool;
let lastDbError = null;
let reconnectTimer = null;
let isReconnecting = false;

async function tryReconnectDb() {
  if (isReconnecting) return !!pool;
  isReconnecting = true;
  try {
    if (pool) {
      try {
        const testConn = await pool.getConnection();
        await testConn.close();
        isReconnecting = false;
        return true;
      } catch (e) {
        console.warn("La conexión activa del pool de Oracle DB falló. Recreando pool...");
        try { await pool.close(0); } catch (_) {}
        pool = null;
      }
    }

    pool = await oracledb.createPool({
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      connectString: process.env.DB_CONNECTION_STRING,
      poolMax: 4,
      poolMin: 1,
      poolIncrement: 0
    });

    const testConn = await pool.getConnection();
    await testConn.close();

    console.log(`✅ Conexión establecida exitosamente con Oracle Database (${process.env.DB_CONNECTION_STRING})`);
    lastDbError = null;
    if (reconnectTimer) {
      clearInterval(reconnectTimer);
      reconnectTimer = null;
    }
    isReconnecting = false;
    return true;
  } catch (err) {
    pool = null;
    lastDbError = {
      message: err.message,
      timestamp: new Date().toISOString()
    };
    console.error(`❌ Error al conectar con Oracle Database (${process.env.DB_CONNECTION_STRING}):`, err.message);

    if (err.message.includes('ECONNREFUSED')) {
      console.log("   👉 Diagnóstico [ECONNREFUSED]: La IP/Host rechazó la conexión en el puerto 1521.");
      console.log("      1. Verifique que el listener de Oracle DB esté iniciado (ej: 'lsnrctl status' en la máquina de la BD).");
      console.log("      2. Si la BD es local en esta máquina, cambie DB_CONNECTION_STRING a 'localhost:1521/XE' en su archivo .env.");
      console.log("      3. Verifique que su IP de red no haya cambiado o que no haya un Firewall bloqueando el puerto 1521.");
    } else if (err.message.includes('ETIMEDOUT') || err.message.includes('NJS-511')) {
      console.log("   👉 Diagnóstico [ETIMEDOUT/NJS-511]: Tiempo de espera agotado al intentar conectar.");
      console.log("      1. Compruebe la conectividad de red / ping a la IP del servidor.");
      console.log("      2. Revise si hay reglas de Firewall bloqueando la conexión.");
    } else if (err.message.includes('ORA-01017')) {
      console.log("   👉 Diagnóstico [ORA-01017]: Usuario o contraseña de Oracle DB incorrectos en .env.");
    } else if (err.message.includes('ORA-12514') || err.message.includes('ORA-12541')) {
      console.log("   👉 Diagnóstico: El nombre de servicio (SID/XE) o el listener no están listos en la BD.");
    }

    console.log("⚠️ El servidor funcionará en MODO LOCAL OFFLINE.");
    console.log("🔄 Reintentos automáticos activados en segundo plano (cada 20s)...");

    if (!reconnectTimer) {
      reconnectTimer = setInterval(async () => {
        await tryReconnectDb();
      }, 20000);
    }

    isReconnecting = false;
    return false;
  }
}

async function initializeDb() {
  await tryReconnectDb();
}

// REST Endpoints
app.get('/api/db-status', async (req, res) => {
  res.json({
    connected: !!pool,
    connectionString: process.env.DB_CONNECTION_STRING || 'No configurado',
    lastError: lastDbError
  });
});

app.post('/api/reconnect', async (req, res) => {
  const connected = await tryReconnectDb();
  res.json({
    connected,
    connectionString: process.env.DB_CONNECTION_STRING || 'No configurado',
    lastError: lastDbError,
    message: connected ? "Conexión con Oracle DB restablecida exitosamente" : "No se pudo conectar a la base de datos"
  });
});

app.get('/api/versions', async (req, res) => {
  if (!pool) {
    await tryReconnectDb();
  }
  if (!pool) {
    return res.status(503).json({ error: "Database offline", isOffline: true, lastError: lastDbError });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    const result = await connection.execute(
      `SELECT id, last_updated, description FROM taskmaster_state ORDER BY id DESC`
    );
    const versions = result.rows.map(row => ({
      id: row[0],
      lastUpdated: row[1],
      description: row[2] || 'Sin descripción'
    }));
    res.json(versions);
  } catch (err) {
    console.error("GET /api/versions error:", err);
    res.status(500).json({ error: "Database error", details: err.message });
  } finally {
    if (connection) {
      try { await connection.close(); } catch (e) {}
    }
  }
});

app.get('/api/data', async (req, res) => {
  if (!pool) {
    await tryReconnectDb();
  }
  if (!pool) {
    return res.status(503).json({ error: "Database offline", isOffline: true, lastError: lastDbError });
  }

  const versionId = req.query.versionId;
  let connection;
  try {
    connection = await pool.getConnection();
    
    let query = `SELECT tasks, notes, servers, pendientes, agenda, trash, categories, directory, files, passwords, id, last_updated FROM taskmaster_state ORDER BY id DESC FETCH FIRST 1 ROWS ONLY`;
    let binds = {};

    if (versionId) {
      query = `SELECT tasks, notes, servers, pendientes, agenda, trash, categories, directory, files, passwords, id, last_updated FROM taskmaster_state WHERE id = :versionId`;
      binds = { versionId: parseInt(versionId) };
    }

    const result = await connection.execute(query, binds);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No state record found" });
    }

    const row = result.rows[0];
    
    const readClob = async (clob) => {
      if (!clob) return '[]';
      if (typeof clob === 'string') return clob;
      return new Promise((resolve, reject) => {
        let clobData = '';
        clob.setEncoding('utf8');
        clob.on('data', (chunk) => { clobData += chunk; });
        clob.on('end', () => resolve(clobData));
        clob.on('error', (err) => reject(err));
      });
    };

    const tasks = JSON.parse(await readClob(row[0]));
    const notes = JSON.parse(await readClob(row[1]));
    const servers = JSON.parse(await readClob(row[2]));
    const pendientes = JSON.parse(await readClob(row[3]));
    const agenda = JSON.parse(await readClob(row[4]) || '{}');
    const trash = JSON.parse(await readClob(row[5]));
    const categories = JSON.parse(await readClob(row[6]) || '[]');
    const directory = JSON.parse(await readClob(row[7]) || '[]');
    const files = JSON.parse(await readClob(row[8]) || '[]');
    const passwords = JSON.parse(await readClob(row[9]) || '[]');
    const currentVersionId = row[10];
    const lastUpdated = row[11];

    res.json({
      tasks,
      notes,
      servers,
      pendientes,
      agenda,
      trash,
      categories,
      directory,
      files,
      passwords,
      versionId: currentVersionId,
      lastUpdated
    });
  } catch (err) {
    console.error("GET /api/data error:", err);
    res.status(500).json({ error: "Database error", details: err.message });
  } finally {
    if (connection) {
      try { await connection.close(); } catch (e) {}
    }
  }
});

async function saveOrUpdateState(req, res, forceInsert = false) {
  if (!pool) {
    await tryReconnectDb();
  }
  if (!pool) {
    return res.status(503).json({ error: "Database offline", isOffline: true, lastError: lastDbError });
  }

  let connection;
  try {
    const { tasks, notes, servers, pendientes, agenda, trash, categories, directory, files, passwords, description, isAutoSync } = req.body;
    connection = await pool.getConnection();

    const shouldUpdate = !forceInsert && (isAutoSync || req.method === 'PUT');
    let maxId = null;

    if (shouldUpdate) {
      const checkResult = await connection.execute(`SELECT MAX(id) FROM taskmaster_state`);
      maxId = (checkResult.rows && checkResult.rows[0]) ? checkResult.rows[0][0] : null;
    }

    if (shouldUpdate && maxId) {
      await connection.execute(
        `UPDATE taskmaster_state 
         SET tasks = :tasks, 
             notes = :notes, 
             servers = :servers, 
             pendientes = :pendientes, 
             agenda = :agenda, 
             trash = :trash, 
             categories = :categories, 
             directory = :directory, 
             files = :files, 
             passwords = :passwords, 
             last_updated = CURRENT_TIMESTAMP
         WHERE id = :maxId`,
        {
          tasks: JSON.stringify(tasks || []),
          notes: JSON.stringify(notes || []),
          servers: JSON.stringify(servers || []),
          pendientes: JSON.stringify(pendientes || []),
          agenda: JSON.stringify(agenda || {}),
          trash: JSON.stringify(trash || []),
          categories: JSON.stringify(categories || []),
          directory: JSON.stringify(directory || []),
          files: JSON.stringify(files || []),
          passwords: JSON.stringify(passwords || []),
          maxId: maxId
        },
        { autoCommit: true }
      );
      res.json({ success: true, message: "Estado activo actualizado en Oracle DB", versionId: maxId });
    } else {
      const result = await connection.execute(
        `INSERT INTO taskmaster_state 
         (tasks, notes, servers, pendientes, agenda, trash, categories, directory, files, passwords, description, last_updated)
         VALUES 
         (:tasks, :notes, :servers, :pendientes, :agenda, :trash, :categories, :directory, :files, :passwords, :description, CURRENT_TIMESTAMP)
         RETURNING id INTO :inserted_id`,
        {
          tasks: JSON.stringify(tasks || []),
          notes: JSON.stringify(notes || []),
          servers: JSON.stringify(servers || []),
          pendientes: JSON.stringify(pendientes || []),
          agenda: JSON.stringify(agenda || {}),
          trash: JSON.stringify(trash || []),
          categories: JSON.stringify(categories || []),
          directory: JSON.stringify(directory || []),
          files: JSON.stringify(files || []),
          passwords: JSON.stringify(passwords || []),
          description: description || (isAutoSync ? 'Sincronización automática' : 'Actualización desde la interfaz'),
          inserted_id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
        },
        { autoCommit: true }
      );
      const versionId = result.outBinds.inserted_id[0];
      res.json({ success: true, message: "Data version saved successfully to Oracle DB", versionId });
    }
  } catch (err) {
    console.error("Save/Update /api/data error:", err);
    res.status(500).json({ error: "Database error", details: err.message });
  } finally {
    if (connection) {
      try { await connection.close(); } catch (e) {}
    }
  }
}

app.post('/api/data', (req, res) => saveOrUpdateState(req, res, !req.body.isAutoSync && !!req.body.description));
app.put('/api/data', (req, res) => { req.body.isAutoSync = true; saveOrUpdateState(req, res, false); });


// ============================================================
// BAT RUNNER — Execute external .bat file and read output .txt files
// ============================================================
let lastBatResult = null;

app.post('/api/run-bat', (req, res) => {
    const { batPath, outputDir, outputFiles = [], timeout = 60000 } = req.body;

    if (!batPath) {
        return res.status(400).json({ success: false, error: 'batPath es requerido' });
    }

    const startTime = Date.now();

    exec('"' + batPath + '"', { timeout: parseInt(timeout), windowsHide: true }, (error, stdout, stderr) => {
        const executionTime = Date.now() - startTime;

        if (error && error.killed) {
            return res.status(408).json({ success: false, error: 'Timeout: el script excedio el tiempo limite (' + Math.round(timeout/1000) + 's)', executionTime });
        }

        // Read output files
        const files = [];
        const fileList = Array.isArray(outputFiles) ? outputFiles : [];
        for (const fileName of fileList) {
            if (!fileName || !fileName.trim()) continue;
            const filePath = outputDir ? path.join(outputDir, fileName) : fileName;
            try {
                const fileContent = fs.readFileSync(filePath, 'utf8');
                files.push({ name: fileName, content: fileContent, path: filePath, ok: true });
            } catch (e) {
                files.push({ name: fileName, content: null, error: e.message, path: filePath, ok: false });
            }
        }

        const result = {
            success: !error,
            executionTime,
            stdout: stdout || '',
            stderr: stderr || '',
            error: error ? error.message : null,
            files,
            timestamp: new Date().toISOString()
        };

        lastBatResult = result;
        res.json(result);
    });
});

app.get('/api/bat-last', (req, res) => {
    if (!lastBatResult) return res.json({ success: false, error: 'Sin ejecuciones previas' });
    res.json(lastBatResult);
});
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

function startServer(portAttempt) {
  const server = app.listen(portAttempt);

  server.on('listening', () => {
    console.log(`TaskMaster Pro Server listening on http://localhost:${portAttempt}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      const nextPort = Number(portAttempt) + 1;
      console.warn(`Port ${portAttempt} is in use, trying ${nextPort}...`);
      startServer(nextPort);
    } else {
      console.error('Server error:', err);
    }
  });
}

initializeDb().then(() => {
  startServer(port);
});

