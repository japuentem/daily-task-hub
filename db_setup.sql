-- SQL Script to set up the database table for TaskMaster state persistence in Oracle DB

/*
================================================================================
INSTRUCCIONES ADMINISTRATIVAS (Ejecutar conectado como SYS o SYSTEM / SYSDBA)
================================================================================

-- 1. Crear el Tablespace (Espacio de almacenamiento en disco para los datos)
-- Nota: La ubicación del archivo datafile depende de la ruta de instalación de tu Oracle.
-- Si da error por la ruta, puedes omitir la ruta completa y usar solo el nombre del archivo 'taskmaster_data.dbf'
CREATE TABLESPACE taskmaster_ts
  DATAFILE 'taskmaster_data.dbf' 
  SIZE 50M 
  AUTOEXTEND ON NEXT 10M MAXSIZE 500M;

-- 2. Crear el Usuario (Esquema) y Password
-- En Oracle 12c o superior (si estás conectado en el contenedor ROOT CDB), 
-- los usuarios comunes deben iniciar con c##. Por ejemplo: c##taskmaster_user.
-- Si estás conectado a un PDB (Pluggable Database) o usas versiones anteriores, puedes crearlo directamente:
CREATE USER taskmaster_user IDENTIFIED BY taskmaster_pass123
  DEFAULT TABLESPACE taskmaster_ts
  TEMPORARY TABLESPACE TEMP;

-- 3. Asignar los permisos necesarios para conectar y crear tablas
GRANT CONNECT, RESOURCE TO taskmaster_user;
GRANT UNLIMITED TABLESPACE TO taskmaster_user;
GRANT CREATE TABLE TO taskmaster_user;

================================================================================
FIN DE INSTRUCCIONES ADMINISTRATIVAS
================================================================================
Una vez ejecutados los pasos anteriores, conéctate con el nuevo usuario
(taskmaster_user / taskmaster_pass123) y ejecuta la creación de la tabla:
*/

-- 1. Create the table
CREATE TABLE taskmaster_state (
    id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tasks CLOB,
    notes CLOB,
    servers CLOB,
    pendientes CLOB,
    agenda CLOB,
    trash CLOB,
    categories CLOB,
    directory CLOB,
    files CLOB,
    passwords CLOB,
    description VARCHAR2(255),
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Insert the initial default record
INSERT INTO taskmaster_state (tasks, notes, servers, pendientes, agenda, trash, categories, directory, files, passwords, description)
VALUES (
    '[]', 
    '[]', 
    '[]', 
    '[]', 
    '{}', 
    '[]', 
    '["Generales", "Trabajo", "Personal", "Reuniones"]',
    '[]',
    '[]',
    '[]',
    'Estado inicial'
);

COMMIT;
/

-- NOTE: To migrate to the new versioning system, drop the old table and recreate it:
-- DROP TABLE taskmaster_state;
-- -- Then run the CREATE TABLE and INSERT statements above.

