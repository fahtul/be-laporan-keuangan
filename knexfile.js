// require("dotenv").config();

// module.exports = {
//   development: {
//     client: process.env.DB_CLIENT || "pg",
//     connection: {
//       host: process.env.DB_HOST,
//       port: Number(process.env.DB_PORT || 5432),
//       user: process.env.DB_USER,
//       password: process.env.DB_PASSWORD,
//       database: process.env.DB_NAME,
//     },
//     migrations: { directory: "./migrations" },
//     seeds: { directory: "./seeds" },
//   },
//   production: {
//     client: process.env.DB_CLIENT || "pg",
//     connection: {
//       host: process.env.DB_HOST,
//       port: Number(process.env.DB_PORT || 5432),
//       user: process.env.DB_USER,
//       password: process.env.DB_PASSWORD,
//       database: process.env.DB_NAME,
//       ssl: { rejectUnauthorized: false },
//     },
//     migrations: { directory: "./migrations" },
//   },
// };

require("dotenv").config();

const isLocal = ["127.0.0.1", "localhost"].includes(process.env.DB_HOST);

const connection = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: isLocal ? false : { rejectUnauthorized: false },
};

module.exports = {
  development: {
    client: process.env.DB_CLIENT || "pg",
    connection,
    migrations: { directory: "./migrations" },
    seeds: { directory: "./seeds" },
  },
  production: {
    client: process.env.DB_CLIENT || "pg",
    connection,
    migrations: { directory: "./migrations" },
  },
};
