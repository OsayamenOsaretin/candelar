import gapi from "googleapis";
import chrono from "chrono-node";
import _ from "lodash";
import models from "./models";
import slack from "./slack";
import moment from "moment";
import async from "async";
import momentz from "moment-timezone";
import request from "request";


const calendarAPi = gapi.calendar("v3");
const OAuth2Client = gapi.auth.OAuth2;
const oauth = new OAuth2Client(process.env.GOOGLE_CLIENT_ID, 
  process.env.GOOGLE_CLIENT_SECRET, 
  process.env.BASE_URI + "calendar/authenticate");


const SCOPES = ["https://www.googleapis.com/auth/calendar", 
  "https://www.googleapis.com/auth/userinfo.email"];

const User = models.User;
const Event = models.Event;

let _self;

const gcalsync = _self = {

  authorise: (req,res) => {
    if(!req.params.id) return res.send("Bad params");

    var url = oauth.generateAuthUrl({ access_type: "offline",
      scope: SCOPES, 
      prompt: "consent", 
      state: req.params.id });
    return res.redirect(url);
  },
  saveToken: (req, res, next) => {
    const  code = req.query.code;
    const userid = req.query.state;

    oauth.getToken(code, function(err, token){
      if(err) {
        console.log("Error:", err);
        return res.redirect(process.env.BASE_URI + "fail");
      }else{
        oauth.credentials = token;
        const oauth2 = gapi.oauth2({ auth: oauth, version: "v2" });

        oauth2.userinfo.get({ fields: ["email"] }, (exc, info) => {
          if(exc) {
            console.log("UserInfo exception", exc);
            return res.redirect(process.env.BASE_URI + "fail");
          }

          const expiresin = moment().add(token.expires_in, "seconds").toDate();

          User.findOneAndUpdate({ userid: userid },
            { $set: { googletoken: token, tokenexpires: expiresin, calendarid: info.data.email } },
            { upsert: true, new: true },
            (er, updated) => {
              if(er) return console.log("Error");
              if(updated) slack.message(updated.slacktoken, 
                userid,
                "Awesome! Authentication successful. Please try creating a calendar event now.",
                {});
              return res.redirect(process.env.BASE_URI + "success");
            });
        });

      }

    });
  },
  create: function(req, res){
    // Event will look like startdate:[4pm on 24/04/20] enddate:[6pm on 24/04/20] title:[my workshop]

    const requestObject = req.requestObject
    const responseUrl = requestObject.response_url;


    oauth.credentials = req.person.googletoken;

    const obj = req.requestObject.submission;

    if(!obj.title && !obj.startdate) return;

    slack.finduser(req.person.userid, req.person.access)
      .then((user) => { _self.createevent(req, obj, user); })
      .catch(() => { _self.createevent(req, obj, {}); });
  },
  createevent: (req, obj, user) => {
    const requestObject = req.requestObject
    const responseUrl = requestObject.response_url;

    const start = momentz.tz(chrono.parseDate(obj.startdate), user.tz).format(),
      stop = momentz.tz(chrono.parseDate(obj.enddate || obj.startdate), user.tz).format(),
      resource = { summary: obj.title, description: obj.description || '', start: { dateTime: start }, end: { dateTime: stop }},
      params = { auth: oauth, calendarId: req.person.calendarid, sendNotifications: true, resource },
      errormsg = "An error occured while creating your event. Please try again.";


    return calendarApi.events.insert(params, (er, gevent) => {
      if(er) {
        console.log("An error occured in creating the event: " + er);

        // Probably token has expired
        oauth.refreshAccessToken((tker, tokens) => {
          if(tker) return console.log("Refresh token error", tker);

          User.update({ userid: req.person.userid }, { $set: { googletoken: tokens }}, (e, res) => {
            if(e) console.log("Save refresh token error", e);

            slack.urlmessage({ rurl: req.body.response_url, message: errormsg });
          });
        })
        return ;
      }

      const createdevent = gevent.data,
        ev = new Event();
      ev.eventid = createdevent.id;
      ev.calendarid = createdevent.creator.email || req.person.calendarid;

      var prompt = "New Event!",
        authed = slack.getauthedwebtoken(req.person.access);

      var attachments = [{
        title: createdevent.summary,
        color: "#36a64f",
        fields: [{
          "title": "",
          "value": createdevent.description
        }, {
          "title": "",
          "value": "_Use the :" + process.env.EVENT_NAME + ": reaction to get a google calendar invite_"
        }]
      }];


      return authed.chat.postMessage(req.requestObject.channel.id, prompt, { attachments })
        .then((resp) => {
          ev.postid = resp.ts;
          ev.save((e) => {
            if(e) console.log("An error occured", e);

            // TODO: if this fails, what do we tell the user?
            else console.log("Created");
          });
        })
        .catch((e) => {
          console.log(e);
        });
    });
  },
  addattendee: (req, res, next) => {
    async.parallel([
      (cb) => {
        Event.findOne({ postid: req.person.event.latest }, (error, val) => {
          User.findOne({ calendarid: val.calendarid }, (exc, vall) => { 
            cb(error || exc, { calendarid: val.calendarid, eventid:val.eventid, token: vall.googletoken });
          });
        });
      },
      (cb) => {
        slack.finduser(req.person.userid, req.person.access).then((user) => { cb(null, user); });
      }], (ero, results) => {
        if(ero) return console.log(ero);

        oauth.credentials = results[0].token;

        const params = {  auth: oauth, calendarId: results[0].calendarid, eventId: results[0].eventid, sendNotifications: true },
          msg = "You've been added successfully to the calendar";

        calendarapi.events.get(params, (err, event) => {

          if(err) {
            console.log("Event retrive error", err);
            slack.message(req.person.access, 
              req.person.userid, 
              "This event might not exist, please try contacting the event organizer",
              { rurl: req.body.response_url, message: msg });
            return;
          }


          const data = event.data;

          data.attendees = data.attendees || [];

          const resource = Object.assign({}, data, { attendees: [ ...data.attendees, { email: results[1].profile.email } ] });

          calendarapi.events.update(Object.assign({}, params, { resource }), (er, update) => {
            if(er) {
              console.log("An error occured in updating the event: " + er);
              slack.message(req.person.access,
                req.person.userid,
                "An error occured adding you to the event, please try again!",
                { rurl: req.body.response_url, message: msg });
              return;
            }

            slack.message(req.person.access,
              req.person.userid,
              "You've been added successfully to the calendar",
              { rurl: req.body.response_url, message: msg });

          });
        });
      });
  },
  openDialog: (req, res, next) =>  {
    const dialogObject = {
      trigger_id: req.body.trigger_id,
      dialog: {
        callback_id: 'create_event',
        title: 'Create a Candelar event',
        submit_label: 'Create',
        elements: [
          {
            "type": "text",
            "label": "Title",
            "name": "title",
            "hint": "Enter the title of your google calendar event",
            "min_length": 1
          },
          {
            "type": "textarea",
            "label": "Description",
            "name": "description",
            "hint": "Enter a description for you event",
            "optional": true
          },
          {
            "type": "text",
            "label": "Start date and time",
            "name": "startdate",
            "hint": "9pm on dd/MM/YY, This friday, Tuesday next week",
            "min_length": 1
          },
          {
            "type": "text",
            "label": "End date and time",
            "name": "enddate",
            "hint": "9pm on dd/MM/YY, This friday, Tuesday next week",
            "optional": true
          }
        ]
      }
    };
    const access = req.person.access;

    try {
      request.post({
        url: "https://slack.com/api/dialog.open",
        headers: {
          Authorization: "Bearer " + access,
          "content-type": 'application/json'
        },
        body: dialogObject,
        json: true
      }, (err, resp, body) => {
        if (body.ok === true) {
          return res.status(200).send();
        }
        throw err;
      }); 
    }
    catch (err) {
      return console.log(err);
    }
  }
}

export default gcalsync;
