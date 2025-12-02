const mysql = require("mysql2/promise");

class Database {
  constructor() {
    if (!Database.instance) {
      this._pool = mysql.createPool({
        connectionLimit: 10, // Example limit, adjust as needed
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        timezone: "+08:00",
        dateStrings: true,
      });

      Database.instance = this;
    }

    return Database.instance;
  }

  getConnection() {
    return this._pool;
  }

  async closeConnection() {
    if (this._pool) {
      await this._pool.end();
      console.log("Database connection closed.");
      // No need to set _pool to null here
    } else {
      console.log("Database connection is already closed.");
    }
  }
}

const instance = new Database();
Object.freeze(instance);

// Listen for SIGINT (Ctrl+C) to gracefully close the DB connection
process.on("SIGINT", async () => {
  try {
    await instance.closeConnection();
    process.exit();
  } catch (err) {
    console.error("Error closing database connection:", err);
    process.exit(1); // Exit with error code
  }
});

module.exports = instance;
