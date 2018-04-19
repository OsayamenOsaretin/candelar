var gapi = require("googleapis"),
    calendarapi = gapi.calendar("v3"),
    OAuth2Client = gapi.auth.OAuth2,
    SCOPES = ["https://www.googleapis.com/auth/calendar", "https://www.googleapis.com/auth/userinfo.email"],
    oauth = new OAuth2Client( process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.BASE_URI + "calendar/authenticate" ),
    _ = require("lodash"),
    chrono = require('chrono-node'),
    User = require("./models").User,
    Event = require("./models").Event,
    slack = require("./slack"),
    moment = require("moment"),
    async = require("async"),
    momentz = require("moment-timezone"),
    _self;
    
module.exports = _self = {
    
    authorise: function(q, p, n){
        if(!q.params.id) return p.send("Bad params");
        
        var url = oauth.generateAuthUrl({ access_type: "offline", scope: SCOPES, prompt: "consent", state: q.params.id });
        return p.redirect(url);
    },
    savetoken: function(q, p, n){
        var code = q.query.code, userid = q.query.state;
        
        oauth.getToken(code, function(err, token){
            if(err) {
                console.log("Error:", err);
                return p.redirect(process.env.BASE_URI + "fail");
            }else{
                oauth.credentials = token;
                
                var oauth2 = gapi.oauth2({ auth: oauth, version: "v2" });
                
                oauth2.userinfo.get({ fields: ["email"] }, function(exc, info){
                    if(exc) {
                        console.log("UserInfo exception", exc);
                        return p.redirect(process.env.BASE_URI + "fail");
                    }
                    
                    var expiresin = moment().add(token.expires_in, "seconds").toDate();
            
                    User.findOneAndUpdate({ userid: userid }, { $set: { googletoken: token, tokenexpires: expiresin, calendarid: info.data.email } }, { upsert: true, new: true }, function(er, up){
                        if(er) return console.log("Error");
                        
                        if(up) slack.message(up.slacktoken, userid, "Awesome! Authentication successful. Please try creating a calendar event now.", {});
                        return p.redirect(process.env.BASE_URI + "success");
                    });
                });
                
            }
            
        });
    },
    create: function(q, p, n){
        // Event will look like startdate:[4pm on 24/04/20] enddate:[6pm on 24/04/20] title:[my workshop]

        if(!q.body.text) return;
        
        oauth.credentials = q.person.googletoken;
            
        var obj = _self.objectifystring(q.body.text);
        
        if(!obj.title && !obj.startdate) return;
        
        slack.finduser(q.person.userid, q.person.access)
            .then(function(user){ _self.createevent(q, obj, user); })
            .catch(function(){ _self.createevent(q, obj, {}); });
    },
    createevent: function(q, obj, user){
        
        var start = momentz.tz(chrono.parseDate(obj.startdate), user.tz).format(),
            stop = momentz.tz(chrono.parseDate(obj.startdate || obj.startdate), user.tz).format(),
            resource = { summary: obj.title, description: "", start: { dateTime: start }, end: { dateTime: stop }},
            params = { auth: oauth, calendarId: q.person.calendarid, sendNotifications: true, resource },
            errormsg = "An error occured while creating your event. Please try again.";
            
        calendarapi.events.insert(params, function(er, gevent){
            
            if(er) {
                console.log("An error occured in creating the event: " + er);
                
                // Probably token has expired
                oauth.refreshAccessToken(function(tker, tokens){
                    if(tker) return console.log("Refresh token error", tker);
                    
                    User.update({ userid: q.person.userid }, { $set: { googletoken: tokens }}, function(e, res){
                       if(e) console.log("Save refresh token error", e);
                       
                    //   slack.message(q.person.userid, errormsg, { rurl: q.body.response_url, message: errormsg });
                        slack.urlmessage({ rurl: q.body.response_url, message: errormsg });
                       
                    });
                })
                
                return;
            }
            
            var createdevent = gevent.data,
                ev = new Event();
            
            ev.eventid = createdevent.id;
            ev.calendarid = createdevent.creator.email || q.person.calendarid;

            var prompt = "A Calendar event has been created with `Candelar`. Use the :" + process.env.EVENT_NAME + ": - `candelar` reaction to get an invite.",
                authed = slack.getauthedwebtoken(q.person.access);
            
            authed.chat.postMessage(q.body.channel_id, prompt, { attachments: [ { text: createdevent.summary, color: "good" } ]})
                .then(function(resp){
                    
                    ev.postid = resp.ts;
                    ev.save(function(e){
                        if(e) console.log("An error occured", e);
                        else console.log("Created");
                    });
                })
                .catch(function(e){
                    console.log(e);
                });
        });
    },
    addattendee: function(q, p, n){
        
        async.parallel([
            function(cb){
                Event.findOne({ postid: q.person.event.latest }, function(error, val){
                    User.findOne({ calendarid: val.calendarid }, function(exc, vall){ 
                        cb(error || exc, { calendarid: val.calendarid, eventid:val.eventid, token: vall.googletoken });
                    });
                });
            },
            function(cb){
                slack.finduser(q.person.userid, q.person.access).then(function(user){ cb(null, user); });
            }], function(ero, results){
                if(ero) return console.log(ero);
                
                oauth.credentials = results[0].token;
                
                var params = {  auth: oauth, calendarId: results[0].calendarid, eventId: results[0].eventid, sendNotifications: true },
                    msg = "You've been added successfully to the calendar";

                calendarapi.events.get(params, function(err, event){
                    
                    // if(err) {
                    //     console.log("Event retrive error", err);
                    //     return;
                    // }
                    

                    var data = event.data;
                    
                    data.attendees = data.attendees || [];
                    
                    var resource = Object.assign({}, data, { attendees: [ ...data.attendees, { email: results[1].profile.email } ] });
                    
                    calendarapi.events.update(Object.assign({}, params, { resource }), function(er, update){
                        // if(er) {
                        //     console.log("An error occured in updating the event: " + er);
                        //     return;
                        // }
                        
                        slack.message(q.person.access, q.person.userid, "You've been added successfully to the calendar", { rurl: q.body.response_url, message: msg });
                        
                    });
                });
            });
    },
    objectifystring: function(str){
        if( typeof str !== "string") return "";
        
        var obj = {}, spl = _.split(str, "] ").map(function(m){ return m.trim().replace("[", "").replace("]", "")});
            
        _.each(spl, function(g){
            var cut = g.split(":");
            obj[cut.shift()] = cut.join("");
        });
        
        return obj;
    }

};