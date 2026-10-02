/**
 * Legacy Server Entrypoint
 * Forwards to the modular backend architecture in backend/server.js
 */

const app = require("../backend/server");
const PORT = process.env.PORT || 5000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`IntraCity Medical Resource Tracker listening at http://localhost:${PORT}`);
  });
}

module.exports = app;
