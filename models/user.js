
const mongoose = require("mongoose");
const passportLocalMongoose = require("passport-local-mongoose");

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true
    }
});

// Add username and password authentication
userSchema.plugin(passportLocalMongoose.default || passportLocalMongoose, {
    usernameUnique: true
});

const User = mongoose.model("User", userSchema);

module.exports = User;
