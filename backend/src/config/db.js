import { Sequelize } from "sequelize";
import dotenv from "dotenv";

dotenv.config();

const sequelize = new Sequelize(
  process.env.PG_DATABASE,
  process.env.PG_USER,
  process.env.PG_PASSWORD,
  {
    host: process.env.PG_HOST || "localhost",
    port: Number(process.env.PG_PORT || 5432),
    dialect: "postgres",
    logging: false
  }
);

const connectDb = async () => {
  if (!process.env.PG_DATABASE) {
    throw new Error("PG_DATABASE is not configured");
  }
  await sequelize.authenticate();
};

export { sequelize, connectDb };