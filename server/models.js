const mongoose = require("mongoose"),
        
    userSchema = new mongoose.Schema({
        regstateid: { type: String, unique: true },
        userid: { type: String },
        teamid: { type: String },
        calendarid: { type: String },
        slacktoken: { type: String },
        googletoken: { },
        tokenexpires: { type: Date },
        created: { type: Date, default: Date.now }
    }),
        
    eventSchema = new mongoose.Schema({
        eventid: { type: String, required: true },
        calendarid: { type: String },
        postid: { type: String, required: true },
        created: { type: Date, default: Date.now }
    }),
        
    teamSchema = new mongoose.Schema({
        teamid: { type: String, required: true },
        bot: { type: String, required: true }
    })

module.exports = {
    User: mongoose.model("User", userSchema),
    Event: mongoose.model("Event", eventSchema),
    Team: mongoose.model("Team", teamSchema)
};
