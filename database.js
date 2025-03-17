// CSGO Code Checker - Database Operations
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Database file path
const DB_FILE = path.join(__dirname, 'codes.db');

// Database connection
let db = null;

// Database schema
const SCHEMA = `
CREATE TABLE IF NOT EXISTS codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  date_found TEXT NOT NULL,
  is_used INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_code ON codes(code);
CREATE INDEX IF NOT EXISTS idx_is_used ON codes(is_used);
`;

// Initialize database
async function initializeDatabase() {
  return new Promise((resolve, reject) => {
    console.log(`Initializing database at ${DB_FILE}`);
    
    // Create database connection
    db = new sqlite3.Database(DB_FILE, (err) => {
      if (err) {
        console.error('Error opening database:', err.message);
        reject(err);
        return;
      }
      
      console.log('Connected to the database.');
      
      // Create tables if they don't exist
      db.run(SCHEMA, (err) => {
        if (err) {
          console.error('Error creating tables:', err.message);
          reject(err);
          return;
        }
        
        console.log('Database initialized successfully.');
        resolve();
      });
    });
  });
}

// Close database
function closeDatabase() {
  if (db) {
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err.message);
      } else {
        console.log('Database connection closed.');
      }
    });
  }
}

// Find codes in text
function findCodes(text, codeRegex) {
  if (!text) return [];
  
  const matches = text.match(codeRegex);
  return matches || [];
}

// Save new codes to database and return newly added ones
async function saveCodesIfNew(codes) {
  if (!codes || !codes.length) return [];
  
  const newCodes = [];
  
  for (const code of codes) {
    try {
      // Check if code already exists and save
      const isNew = await new Promise((resolve, reject) => {
        const checkSql = 'SELECT code FROM codes WHERE code = ?';
        
        db.get(checkSql, [code.code], (err, row) => {
          if (err) return reject(err);
          
          // Code not found, add new one
          if (!row) {
            const insertSql = 'INSERT INTO codes (code, date_found, is_used) VALUES (?, ?, ?)';
            
            db.run(insertSql, [code.code, code.date_found, code.is_used], function(err) {
              if (err) {
                // Ignore UNIQUE constraint errors (likely concurrent insertion attempt)
                if (err.message.includes('UNIQUE constraint failed')) {
                  return resolve(false);
                }
                return reject(err);
              }
              
              // New code added
              newCodes.push({
                id: this.lastID,
                ...code
              });
              
              resolve(true);
            });
          } else {
            // Code already exists
            resolve(false);
          }
        });
      });
      
    } catch (error) {
      console.error(`Error saving code (${code.code}):`, error);
    }
  }
  
  return newCodes;
}

// Get unused codes
async function getUnusedCodes() {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT id, code, date_found, is_used FROM codes WHERE is_used = 0 ORDER BY date_found DESC';
    
    db.all(sql, [], (err, rows) => {
      if (err) {
        console.error('Error fetching unused codes:', err);
        return reject(err);
      }
      
      resolve(rows);
    });
  });
}

// Mark code as used
async function markCodeAsUsed(code) {
  return new Promise((resolve, reject) => {
    const sql = 'UPDATE codes SET is_used = 1 WHERE code = ? AND is_used = 0';
    
    db.run(sql, [code], function(err) {
      if (err) {
        console.error(`Error marking code (${code}):`, err);
        return reject(err);
      }
      
      // Number of rows updated
      resolve(this.changes > 0);
    });
  });
}

// Get statistics
async function getStats() {
  return new Promise((resolve, reject) => {
    db.get(`
      SELECT 
        COUNT(*) as totalCodes,
        SUM(CASE WHEN is_used = 0 THEN 1 ELSE 0 END) as unusedCodes,
        SUM(CASE WHEN is_used = 1 THEN 1 ELSE 0 END) as usedCodes,
        SUM(CASE WHEN date_found >= date('now', 'start of day') THEN 1 ELSE 0 END) as todayCodes
      FROM codes
    `, [], (err, row) => {
      if (err) {
        console.error('Error getting stats:', err.message);
        reject(err);
        return;
      }
      
      resolve(row);
    });
  });
}

// Exported functions
module.exports = {
  initializeDatabase,
  closeDatabase,
  findCodes,
  saveCodesIfNew,
  getUnusedCodes,
  markCodeAsUsed,
  getStats
}; 