import app from "./app.js";
import { connectDb } from "./config/db.js";
import { sequelize } from "./models.js";

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
