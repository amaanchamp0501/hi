const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

const dataDir = path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "quota.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS weeks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_id INTEGER NOT NULL,
  discord_user_id TEXT NOT NULL,
  roblox_username TEXT,
  event_type TEXT NOT NULL,
  event_name TEXT,
  cohost_user_id TEXT,
  supervisor_user_id TEXT,
  announcement_channel_id TEXT,
  announcement_message_id TEXT UNIQUE,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  cancelled_at TEXT,
  FOREIGN KEY (week_id) REFERENCES weeks(id)
);

CREATE TABLE IF NOT EXISTS duties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_id INTEGER NOT NULL,
  discord_user_id TEXT NOT NULL,
  duty_type TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  FOREIGN KEY (week_id) REFERENCES weeks(id)
);

CREATE TABLE IF NOT EXISTS reforms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_id INTEGER NOT NULL,
  discord_user_id TEXT NOT NULL,
  reform_type TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  FOREIGN KEY (week_id) REFERENCES weeks(id)
);

CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_id INTEGER NOT NULL,
  discord_user_id TEXT NOT NULL,
  department_name TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  FOREIGN KEY (week_id) REFERENCES weeks(id)
);
`);

function activeWeek() {
  let week = db.prepare("SELECT * FROM weeks WHERE status = 'active' ORDER BY id DESC LIMIT 1").get();
  if (!week) {
    const now = new Date().toISOString();
    const info = db.prepare("INSERT INTO weeks (started_at, status) VALUES (?, 'active')").run(now);
    week = db.prepare("SELECT * FROM weeks WHERE id = ?").get(info.lastInsertRowid);
  }
  return week;
}

function createEvent(data) {
  const week = activeWeek();
  const now = new Date().toISOString();
  const info = db.prepare(`
    INSERT INTO events
    (week_id, discord_user_id, roblox_username, event_type, event_name, cohost_user_id,
     supervisor_user_id, announcement_channel_id, announcement_message_id, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    week.id, data.hostId, data.robloxUsername || null, data.eventType, data.eventName || null,
    data.cohostId || null, data.supervisorId || null, data.channelId || null,
    data.messageId || null, now, data.createdBy
  );
  return db.prepare("SELECT * FROM events WHERE id = ?").get(info.lastInsertRowid);
}

function cancelEvent(id) {
  return db.prepare("UPDATE events SET cancelled_at = ? WHERE id = ? AND cancelled_at IS NULL")
    .run(new Date().toISOString(), id).changes > 0;
}

function addDuty(userId, dutyType, notes, createdBy) {
  const week = activeWeek();
  db.prepare("INSERT INTO duties (week_id, discord_user_id, duty_type, notes, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)")
    .run(week.id, userId, dutyType, notes || null, new Date().toISOString(), createdBy);
}

function addReform(userId, reformType, notes, createdBy) {
  const week = activeWeek();
  db.prepare("INSERT INTO reforms (week_id, discord_user_id, reform_type, notes, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)")
    .run(week.id, userId, reformType, notes || null, new Date().toISOString(), createdBy);
}

function addDepartment(userId, departmentName, createdBy) {
  const week = activeWeek();
  db.prepare("INSERT INTO departments (week_id, discord_user_id, department_name, created_at, created_by) VALUES (?, ?, ?, ?, ?)")
    .run(week.id, userId, departmentName || null, new Date().toISOString(), createdBy);
}

function getEventsForUser(userId) {
  const week = activeWeek();
  return db.prepare("SELECT * FROM events WHERE week_id = ? AND discord_user_id = ? AND cancelled_at IS NULL ORDER BY id DESC")
    .all(week.id, userId);
}

function getCohostEventsForUser(userId) {
  const week = activeWeek();
  return db.prepare("SELECT * FROM events WHERE week_id = ? AND cohost_user_id = ? AND cancelled_at IS NULL ORDER BY id DESC")
    .all(week.id, userId);
}

function getDutiesForUser(userId) {
  const week = activeWeek();
  return db.prepare("SELECT * FROM duties WHERE week_id = ? AND discord_user_id = ? ORDER BY id DESC").all(week.id, userId);
}

function getReformsForUser(userId) {
  const week = activeWeek();
  return db.prepare("SELECT * FROM reforms WHERE week_id = ? AND discord_user_id = ? ORDER BY id DESC").all(week.id, userId);
}

function getDepartmentsForUser(userId) {
  const week = activeWeek();
  return db.prepare("SELECT * FROM departments WHERE week_id = ? AND discord_user_id = ? ORDER BY id DESC").all(week.id, userId);
}

function getAllEvents() {
  const week = activeWeek();
  return db.prepare("SELECT * FROM events WHERE week_id = ? AND cancelled_at IS NULL ORDER BY id ASC").all(week.id);
}

function archiveAndReset() {
  const current = activeWeek();
  const now = new Date().toISOString();
  db.prepare("UPDATE weeks SET ended_at = ?, status = 'archived' WHERE id = ?").run(now, current.id);
  const info = db.prepare("INSERT INTO weeks (started_at, status) VALUES (?, 'active')").run(now);
  return {
    archivedWeek: current,
    newWeek: db.prepare("SELECT * FROM weeks WHERE id = ?").get(info.lastInsertRowid)
  };
}

module.exports = {
  db, activeWeek, createEvent, cancelEvent, addDuty, addReform, addDepartment,
  getEventsForUser, getCohostEventsForUser, getDutiesForUser, getReformsForUser,
  getDepartmentsForUser, getAllEvents, archiveAndReset
};
