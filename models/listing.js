
const mongoose = require("mongoose");

const listingSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },

    description: {
        type: String
    },

    image: {
        type: String,
        default: "https://images.unsplash.com/photo-1564013799919-ab600027ffc6"
    },

    price: {
        type: Number,
        required: true
    },

    location: {
        type: String,
        required: true
    },

    country: {
        type: String,
        required: true
    },

    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },

    reviews: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Review"
        }
    ]
});

const Listing = mongoose.model("Listing", listingSchema);

module.exports = Listing;
