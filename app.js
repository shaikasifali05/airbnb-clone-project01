
const express = require("express");
const mongoose = require("mongoose");
const ejsMate = require("ejs-mate");
const path = require("path");
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local");

require("dotenv").config();

const Listing = require("./models/listing");
const User = require("./models/user");
const Booking = require("./models/booking");
const Review = require("./models/review");

const app = express();
const PORT = 8080;

// ==================== APP CONFIGURATION ====================

app.engine("ejs", ejsMate);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ==================== SESSION CONFIGURATION ====================

app.use(
    session({
        secret: process.env.SESSION_SECRET || "airbnb-secret-key",
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            maxAge: 7 * 24 * 60 * 60 * 1000
        }
    })
);

// ==================== PASSPORT CONFIGURATION ====================

app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy(User.authenticate()));

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// Make authentication information available in all EJS pages

app.use((req, res, next) => {
    res.locals.currentUser = req.user || null;
    res.locals.isAuthenticated = req.isAuthenticated();
    next();
});

// ==================== AUTHENTICATION MIDDLEWARE ====================

const isLoggedIn = (req, res, next) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }

    next();
};

// ==================== OWNER MIDDLEWARE ====================

const isOwner = async (req, res, next) => {
    try {
        const listing = await Listing.findById(req.params.id);

        if (!listing) {
            return res.status(404).send("Property not found.");
        }

        if (
            !listing.owner ||
            listing.owner.toString() !== req.user._id.toString()
        ) {
            return res.status(403).send(
                "Access denied. Only the property owner can perform this action."
            );
        }

        req.listing = listing;
        next();

    } catch (err) {
        console.error("Owner Middleware Error:", err);
        res.status(500).send("Something went wrong.");
    }
};

// ==================== HOME PAGE ====================

app.get("/", async (req, res) => {
    try {
        const listings = await Listing.find({});
        res.render("home", { listings });

    } catch (err) {
        console.error("Home Page Error:", err);
        res.status(500).send("Unable to load home page.");
    }
});

// ==================== ALL LISTINGS ====================

app.get("/listings", async (req, res) => {
    try {
        const location = req.query.location || "";

        let listings;

        if (location.trim() !== "") {
            listings = await Listing.find({
                location: {
                    $regex: location,
                    $options: "i"
                }
            });
        } else {
            listings = await Listing.find({});
        }

        res.render("listings", {
            listings,
            location
        });

    } catch (err) {
        console.error("Listings Error:", err);
        res.status(500).send("Unable to load properties.");
    }
});

// ==================== NEW LISTING FORM ====================

app.get("/listings/new", isLoggedIn, (req, res) => {
    res.render("new");
});

// ==================== CREATE LISTING ====================

app.post("/listings", isLoggedIn, async (req, res) => {
    try {
        const newListing = new Listing(req.body.listing);

        newListing.owner = req.user._id;

        await newListing.save();

        res.redirect("/listings");

    } catch (err) {
        console.error("Create Listing Error:", err);
        res.status(500).send("Unable to create property.");
    }
});

// ==================== SHOW LISTING ====================

app.get("/listings/:id", async (req, res) => {
    try {
        const listing = await Listing.findById(req.params.id)
            .populate({
                path: "reviews",
                populate: {
                    path: "author"
                }
            });

        if (!listing) {
            return res.status(404).send("Property not found.");
        }

        const reviews = listing.reviews || [];

        const totalRating = reviews.reduce(
            (total, review) => total + review.rating,
            0
        );

        const averageRating = reviews.length
            ? (totalRating / reviews.length).toFixed(1)
            : null;

        res.render("show", {
            listing,
            averageRating,
            currentUser: req.user || null,
            isAuthenticated: req.isAuthenticated()
        });

    } catch (err) {
        console.error("Show Listing Error:", err);
        res.status(500).send("Unable to display property.");
    }
});

// ==================== EDIT LISTING ====================

app.get("/listings/:id/edit", isLoggedIn, isOwner, (req, res) => {
    res.render("edit", {
        listing: req.listing
    });
});

app.post("/listings/:id/edit", isLoggedIn, isOwner, async (req, res) => {
    try {
        await Listing.findByIdAndUpdate(
            req.params.id,
            { ...req.body.listing },
            { runValidators: true }
        );

        res.redirect(`/listings/${req.params.id}`);

    } catch (err) {
        console.error("Edit Listing Error:", err);
        res.status(500).send("Unable to update property.");
    }
});

// ==================== DELETE LISTING ====================

app.post("/listings/:id/delete", isLoggedIn, isOwner, async (req, res) => {
    try {
        const existingBooking = await Booking.findOne({
            listing: req.params.id
        });

        if (existingBooking) {
            return res.status(400).send(
                "This property cannot be deleted because booking records exist."
            );
        }

        await Review.deleteMany({
            listing: req.params.id
        });

        await Listing.findByIdAndDelete(req.params.id);

        res.redirect("/listings");

    } catch (err) {
        console.error("Delete Listing Error:", err);
        res.status(500).send("Unable to delete property.");
    }
});

// ==================== BOOK PROPERTY ====================

app.post("/listings/:id/book", isLoggedIn, async (req, res) => {
    try {
        const { checkIn, checkOut, guests } = req.body;

        const startDate = new Date(checkIn);
        const endDate = new Date(checkOut);
        const guestCount = Number(guests);

        if (
            !checkIn ||
            !checkOut ||
            isNaN(startDate.getTime()) ||
            isNaN(endDate.getTime()) ||
            endDate <= startDate ||
            !Number.isInteger(guestCount) ||
            guestCount < 1 ||
            guestCount > 20
        ) {
            return res.status(400).send(
                "Please enter valid booking details."
            );
        }

        const listing = await Listing.findById(req.params.id);

        if (!listing) {
            return res.status(404).send("Property not found.");
        }

        // Prevent booking your own property

        if (
            listing.owner &&
            listing.owner.toString() === req.user._id.toString()
        ) {
            return res.status(403).send(
                "You cannot book your own property."
            );
        }

        // Check overlapping bookings

        const overlappingBooking = await Booking.findOne({
            listing: listing._id,
            status: { $ne: "Cancelled" },
            checkIn: { $lt: endDate },
            checkOut: { $gt: startDate }
        });

        if (overlappingBooking) {
            return res.status(400).send(
                "Sorry! This property is already booked for these dates."
            );
        }

        // Calculate booking price

        const nights = Math.ceil(
            (endDate - startDate) / (1000 * 60 * 60 * 24)
        );

        const totalPrice = nights * listing.price;

        // Create booking

        const booking = new Booking({
            listing: listing._id,
            user: req.user._id,
            checkIn: startDate,
            checkOut: endDate,
            guests: guestCount,
            totalPrice,
            status: "Confirmed"
        });

        await booking.save();

        // Display booking success page

        res.render("bookingSuccess", {
            booking,
            listing,
            checkIn: booking.checkIn,
            checkOut: booking.checkOut,
            guests: booking.guests,
            totalPrice: booking.totalPrice
        });

    } catch (err) {
        console.error("Booking Error:", err);
        res.status(500).send("Unable to complete booking.");
    }
});

// ==================== MY BOOKINGS ====================

app.get("/my-bookings", isLoggedIn, async (req, res) => {
    try {
        const bookings = await Booking.find({
            user: req.user._id
        }).populate("listing");

        res.render("myBookings", {
            bookings
        });

    } catch (err) {
        console.error("My Bookings Error:", err);
        res.status(500).send("Unable to load bookings.");
    }
});

// ==================== CANCEL BOOKING ====================

app.post("/bookings/:id/cancel", isLoggedIn, async (req, res) => {
    try {
        const booking = await Booking.findOne({
            _id: req.params.id,
            user: req.user._id
        });

        if (!booking) {
            return res.status(404).send("Booking not found.");
        }

        if (booking.status === "Cancelled") {
            return res.status(400).send(
                "This booking is already cancelled."
            );
        }

        booking.status = "Cancelled";

        await booking.save();

        res.redirect("/my-bookings");

    } catch (err) {
        console.error("Cancel Booking Error:", err);
        res.status(500).send("Unable to cancel booking.");
    }
});

// ==================== PROFILE ====================

app.get("/profile", isLoggedIn, (req, res) => {
    res.render("users/profile", {
        currentUser: req.user
    });
});

// ==================== REVIEW FORM ====================

app.get("/listings/:id/reviews/new", isLoggedIn, async (req, res) => {
    try {
        const listing = await Listing.findById(req.params.id);

        if (!listing) {
            return res.status(404).send("Property not found.");
        }

        res.render("review", { listing });

    } catch (err) {
        console.error("Review Form Error:", err);
        res.status(500).send("Unable to open review form.");
    }
});

// ==================== SUBMIT REVIEW ====================

app.post("/listings/:id/reviews", isLoggedIn, async (req, res) => {
    try {
        const listing = await Listing.findById(req.params.id);

        if (!listing) {
            return res.status(404).send("Property not found.");
        }

        const rating = Number(req.body.review?.rating);
        const comment = req.body.review?.comment?.trim();

        if (
            !Number.isInteger(rating) ||
            rating < 1 ||
            rating > 5 ||
            !comment ||
            comment.length < 3 ||
            comment.length > 1000
        ) {
            return res.status(400).send(
                "Please provide a valid rating and review."
            );
        }

        const review = new Review({
            rating,
            comment,
            author: req.user._id,
            listing: listing._id
        });

        await review.save();

        if (!listing.reviews) {
            listing.reviews = [];
        }

        listing.reviews.push(review._id);

        await listing.save();

        res.redirect(`/listings/${listing._id}`);

    } catch (err) {
        console.error("Submit Review Error:", err);
        res.status(500).send("Unable to submit review.");
    }
});

// ==================== DELETE REVIEW ====================

app.post(
    "/listings/:id/reviews/:reviewId/delete",
    isLoggedIn,
    async (req, res) => {
        try {
            const listing = await Listing.findById(req.params.id);

            if (!listing) {
                return res.status(404).send("Property not found.");
            }

            const review = await Review.findOne({
                _id: req.params.reviewId,
                listing: listing._id
            });

            if (!review) {
                return res.status(404).send("Review not found.");
            }

            if (
                review.author.toString() !== req.user._id.toString()
            ) {
                return res.status(403).send(
                    "You can only delete your own review."
                );
            }

            await Review.findByIdAndDelete(review._id);

            listing.reviews.pull(review._id);

            await listing.save();

            res.redirect(`/listings/${listing._id}`);

        } catch (err) {
            console.error("Delete Review Error:", err);
            res.status(500).send("Unable to delete review.");
        }
    }
);

// ==================== SIGNUP ====================

app.get("/signup", (req, res) => {
    res.render("users/signup");
});

app.post("/signup", async (req, res) => {
    try {
        const { username, password, email } = req.body;

        const newUser = new User({
            username,
            email
        });

        const registeredUser = await User.register(
            newUser,
            password
        );

        req.login(registeredUser, (err) => {
            if (err) {
                console.error(err);

                return res.status(500).send(
                    "Unable to log in after signup."
                );
            }

            res.redirect("/");
        });

    } catch (err) {
        console.error("Signup Error:", err);

        res.status(400).send(
            "Signup failed. Username may already exist."
        );
    }
});

// ==================== LOGIN ====================

app.get("/login", (req, res) => {
    res.render("users/login");
});

app.post(
    "/login",
    passport.authenticate("local", {
        failureRedirect: "/login"
    }),
    (req, res) => {
        res.redirect("/");
    }
);

// ==================== LOGOUT ====================

app.get("/logout", (req, res, next) => {
    req.logout((err) => {
        if (err) {
            return next(err);
        }

        res.redirect("/");
    });
});

// ==================== DATABASE CONNECTION ====================

mongoose.connect(process.env.MONGO_URL)
    .then(() => {
        console.log("MongoDB connected successfully!");
    })
    .catch((err) => {
        console.error("MongoDB connection error:", err);
    });

// ==================== START SERVER ====================

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
