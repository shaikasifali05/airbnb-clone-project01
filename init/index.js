
const mongoose = require("mongoose");
const Listing = require("../models/listing");
const initData = require("./data");

require("dotenv").config();

const initDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URL);
        console.log("Connected to MongoDB!");

        // Clear old sample listings
        await Listing.deleteMany({});

        // Insert new sample listings
        await Listing.insertMany(initData.data);

        console.log("Sample listings added successfully!");

    } catch (error) {
        console.log("Error:", error);
    } finally {
        await mongoose.disconnect();
    }
};

initDB();
