
const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({
    listing: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Listing",
        required: true
    },

    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    checkIn: {
        type: Date,
        required: true
    },

    checkOut: {
        type: Date,
        required: true
    },

    guests: {
        type: Number,
        required: true,
        min: 1
    },

    totalPrice: {
        type: Number,
        required: true
    },

    status: {
        type: String,
        enum: ["Confirmed", "Cancelled"],
        default: "Confirmed"
    }

}, { timestamps: true });

const Booking = mongoose.model("Booking", bookingSchema);

module.exports = Booking;
