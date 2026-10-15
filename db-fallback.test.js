const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const dbModulePath = path.resolve(__dirname, '../db.js');

test('sem variáveis de ambiente do banco, o módulo usa dados de demonstração', () => {
  const previous = {
    MYSQLHOST: process.env.MYSQLHOST,
    MYSQLUSER: process.env.MYSQLUSER,
    MYSQLPASSWORD: process.env.MYSQLPASSWORD,
    MYSQLDATABASE: process.env.MYSQLDATABASE,
    MYSQLPORT: process.env.MYSQLPORT,
    DB_HOST: process.env.DB_HOST,
    DB_USER: process.env.DB_USER,
    DB_PASS: process.env.DB_PASS,
    DB_NAME: process.env.DB_NAME,
    DB_PORT: process.env.DB_PORT,
  };

  delete process.env.MYSQLHOST;
  delete process.env.MYSQLUSER;
  delete process.env.MYSQLPASSWORD;
  delete process.env.MYSQLDATABASE;
  delete process.env.MYSQLPORT;
  delete process.env.DB_HOST;
  delete process.env.DB_USER;
  delete process.env.DB_PASS;
  delete process.env.DB_NAME;
  delete process.env.DB_PORT;

  delete require.cache[dbModulePath];

  try {
    const db = require(dbModulePath);
    assert.equal(db.isConfigured, false);
    db.query('SELECT * FROM produtos', (err, rows) => {
      assert.equal(err, null);
      assert.ok(Array.isArray(rows));
      assert.ok(rows.length >= 3);
      assert.equal(rows[0].nome, 'Caderno');
    });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    delete require.cache[dbModulePath];
  }
});
