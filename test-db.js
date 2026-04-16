import Database from 'better-sqlite3';

try {
  const db = new Database('./data/comics.db');
  console.log("Checking comics.db schema");
  const tableInfo = db.prepare("PRAGMA table_info(series)").all();
  console.log("Series columns:");
  console.log(tableInfo);
} catch (e) {
  console.error("Error:", e.message);
}
