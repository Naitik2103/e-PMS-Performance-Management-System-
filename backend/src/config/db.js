const mongoose = require("mongoose");

const connectDb = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error("MONGO_URI is not configured");
  }
  await mongoose.connect(uri, {
    autoIndex: true
  });
};

module.exports = connectDb;
