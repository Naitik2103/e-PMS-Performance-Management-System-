const app = require("./app");
const { connectDb } = require("./config/db");
const { sequelize } = require("./models");

const PORT = process.env.PORT || 5000;

connectDb()
  .then(async () => {
    await sequelize.sync();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to connect to Postgres", error);
    process.exit(1);
  });
