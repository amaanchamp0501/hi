const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");
fs.mkdirSync(path.join(process.cwd(), "data"), {recursive:true});
const db = new Database(path.join(process.cwd(), "data", "events.db"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS guild_settings (
 guild_id TEXT PRIMARY KEY, host_role_id TEXT, announcement_channel_id TEXT,
 reset_days INTEGER NOT NULL DEFAULT 7, last_reset_at TEXT, next_reset_at TEXT
);
CREATE TABLE IF NOT EXISTS events (
 id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, week_key TEXT NOT NULL,
 host_id TEXT NOT NULL, cohost_id TEXT, supervisor_id TEXT, name TEXT NOT NULL,
 description TEXT, channel_id TEXT NOT NULL, message_id TEXT, locked INTEGER NOT NULL DEFAULT 0,
 cancelled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS attendees (
 event_id INTEGER NOT NULL, user_id TEXT NOT NULL, joined_at TEXT NOT NULL,
 PRIMARY KEY(event_id,user_id), FOREIGN KEY(event_id) REFERENCES events(id)
);
`);
function ensureGuild(guildId) {
 let row=db.prepare("SELECT * FROM guild_settings WHERE guild_id=?").get(guildId);
 if(!row){const now=new Date();db.prepare("INSERT INTO guild_settings(guild_id,last_reset_at,next_reset_at) VALUES(?,?,?)").run(guildId,now.toISOString(),new Date(now.getTime()+7*86400000).toISOString());row=db.prepare("SELECT * FROM guild_settings WHERE guild_id=?").get(guildId);}
 return row;
}
function setSetting(guildId,key,value){if(!["host_role_id","announcement_channel_id","reset_days","last_reset_at","next_reset_at"].includes(key))throw new Error("Invalid setting");ensureGuild(guildId);db.prepare("UPDATE guild_settings SET "+key+"=? WHERE guild_id=?").run(value,guildId);}
function currentWeekKey(guildId){return ensureGuild(guildId).last_reset_at;}
function createEvent(e){const w=currentWeekKey(e.guildId);const info=db.prepare("INSERT INTO events(guild_id,week_key,host_id,cohost_id,supervisor_id,name,description,channel_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)").run(e.guildId,w,e.hostId,e.cohostId||null,e.supervisorId||null,e.name,e.description||"",e.channelId,new Date().toISOString());return db.prepare("SELECT * FROM events WHERE id=?").get(info.lastInsertRowid);}
function setMessage(id,messageId){db.prepare("UPDATE events SET message_id=? WHERE id=?").run(messageId,id);}
function getEvent(id){return db.prepare("SELECT * FROM events WHERE id=?").get(id);}
function toggleLock(id,locked){db.prepare("UPDATE events SET locked=? WHERE id=?").run(locked?1:0,id);}
function joinEvent(id,userId){const e=getEvent(id);if(!e||e.locked||e.cancelled)return false;return db.prepare("INSERT OR IGNORE INTO attendees(event_id,user_id,joined_at) VALUES(?,?,?)").run(id,userId,new Date().toISOString()).changes>0;}
function getQuota(guildId,userId){const week=currentWeekKey(guildId);return db.prepare("SELECT COUNT(*) n FROM events WHERE guild_id=? AND week_key=? AND cancelled=0 AND (host_id=? OR cohost_id=?)").get(guildId,week,userId,userId).n;}
function getEvents(guildId){return db.prepare("SELECT * FROM events WHERE guild_id=? AND week_key=? AND cancelled=0 ORDER BY id").all(guildId,currentWeekKey(guildId));}
function resetGuild(guildId){const s=ensureGuild(guildId),now=new Date(),next=new Date(now.getTime()+s.reset_days*86400000);setSetting(guildId,"last_reset_at",now.toISOString());setSetting(guildId,"next_reset_at",next.toISOString());return {now:now.toISOString(),next:next.toISOString()};}
function dueResets(){return db.prepare("SELECT * FROM guild_settings WHERE next_reset_at<=?").all(new Date().toISOString());}
module.exports={db,ensureGuild,setSetting,createEvent,setMessage,getEvent,toggleLock,joinEvent,getQuota,getEvents,resetGuild,dueResets};
