const { createKoraApp, s } = require('kora-framework');
const oracledb = require('oracledb');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');


dotenv.config();

const app = createKoraApp();

const port = parseInt(process.env.PORT, 10) || 3000;

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

    console.log(' Conexión establecida con Oracle DB (' + process.env.DB_CONNECTION_STRING + ')');
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
    console.log(' Conexión a Oracle no disponible. Modo local offline.');
    if (!reconnectTimer) {
      reconnectTimer = setInterval(async () => {
        await tryReconnectDb();
      }, 20000);
    }
    isReconnecting = false;
    return false;
  }
}

// Logger Middleware
app.use((ctx) => {
  console.log('KKORA HTTP] ${ ctx.method } ${ctx.path}');
});

// GET /api/db-status
app.get('/api/db-status', () => ({
  connected: !!pool,
  connectionString: process.env.DB_CONNECTION_STRING || 'No configurado',
  lastError: lastDbError
}), 'Estado de conexion a Oracle DB');

// POST /api/reconnect
app.post('/api/reconnect', s.object({}), async () => {
  const connected = await tryReconnectDb();
  return {
    connected,
    connectionString: process.env.DB_CONNECTION_STRING || 'No configurado',
    lastError: lastDbError,
    message: connected ? 'Conexión restablecida' : 'No se pudo conectar'
  };
}, 'Reconecta con la DB');

// GET /api/versions
app.get('/api/versions', async () => {
  if (!pool) await tryReconnectDb();
  if (!pool) return { error: 'Database offline', isOffline: true, lastError: lastDbError };

  let connection;
  try {
    connection = await pool.getConnection();
    const result = await connection.execute('SELECT id, last_updated, description FROM taskmaster_state ORDER BY id DESC');
    return result.rows.map(row => ({
      id: row[0],
      lastUpdated: row[1],
      description: row[2] || 'Sin descripción'
    }));
  } finally {
    if (connection) { try { await connection.close(); } catch (_) {} }
  }
}, 'Lista historial de versiones');

	// GET /api/bat-last
let lastBatResult = null;
app.get('/api/bat-last', () => {
  if (!lastBatResult) return { success: false, error: 'Sin ejecuciones previas' };
  return lastBatResult;
}, 'Ultimo resultado BAT');

// Proteccion Web Estatica
const originalFetch = app.fetch.bind(app);
app.fetch = async (request) => {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api') && url.pathname !== '/docs' && url.pathname !== '/openapi.json') {
    let filePath = path.join(__dirname, url.pathname === '/' ? 'index.html' : url.pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const mimes = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml'
      };
      return new Response(fs.readFileSync(filePath), {
        headers: { 'Content-Type': mimes[ext] || 'application/octet-stream' }
      });
    } else {
      return new Response(fs.readFileSync(path.join(__dirname, 'index.html')), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }
  }
  return originalFetch(request);
};

async function initServer() {
  await tryReconnectDb();
  app.listen(port, () => {
    console.log('==================================================');
    console.log('⚡ TaskMaster Pro — Servidor Kora Framework Activo');
    console.log('  App Web:       http://localhost:' + port);
    console.log('  Swagger Docs:  http://localhost:' + port + '/docs');
    console.log('  OpenAPI Spec:  http://localhost:' + port + '/openapi.json');
    console.log('==================================================');
  });
}


initServer();
