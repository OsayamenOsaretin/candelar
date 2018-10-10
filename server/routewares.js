import chrono from "chrono-node";
import momentz from "moment-timezone";
import slack from "./slack";
import models from "./models";


const User = models.User;
const Team = models.Team


module.exports = {
  slackAuthware: (req, res, next) => {
    if(!req.token) return res.send("No token provided");
    else if(req.token != process.env.SLACK_TOKEN) return res.send("Invalid token provided");
    else res.status(200).send();

    const  userid = req.userid;
    req.person = {};


    if(req.body.event) next(); // Send a Slack event

    else if(userid) { // Send a slack command.
      // Check to see if user has already been signed up.
      if (!userid) return;

      const signupMessage = "Seems like *candelar* does not have access to either your workspace or calendar. Please go to " +
        process.env.BASE_URI + "slack/authorise/" +
        userid.toLowerCase();

      User.findOne({ userid: userid }, (err, slackUser) => {
        if (err) return console.log(err);

        if (!slackUser) {
          // Send message to user with link;
          slack.urlMessage({ rurl: req.body.response_url, 
                            message: signupMessage })       
        } else {
          if(slackUser.slacktoken && slackUser.googletoken) {
            slack.testTokenValid(slackUser.slacktoken)
              .then((data) => {
                if(data.ok) {
                  req.person = {access: slackUser.slacktoken,
                                userid: userid,
                                googletoken: slackUser.googletoken,
                                calendarid: slackUser.calendarid};
                  next();
                } else {
                  slack.urlMessage({ rurl: req.body.response_url, 
                                     message: signupMessage });
                }
              });
          } else {
            slack.urlMessage({ rurl: req.body.response_url, 
                              message: signupMessage });
          }
        }
      });
    }
  },
  slackTeamAuthware: (req, res, next) => {
    if( !(req.body.event && req.body.event.reaction == process.env.EVENT_NAME) ) return;
    req.person.userid = req.body.event.user;
    req.person.event = { latest: req.body.event.item.ts,
                         channel: req.body.event.item.channel, 
                         inclusive: true,
                         count: 1 };

    Team.findOne({ teamid: req.body.team_id }, (err, team) => {
      if(err) return;

      slack.testTokenValid(team.bot)
        .then((data) => {
          if(team) {
            req.person.access = team.bot;
            next();
          }else{
            console.log("Token event error. How...will find out later");
          }
        });
    });
  },
  tokenware: (req, res, next) => {
    req.token = req.body.token;
    req.userid = req.body.user_id;
    next();
  },
  formTokenware: (req, res, next) => {
    const requestObject = JSON.parse(req.body.payload);
    req.requestObject = requestObject

    req.token = requestObject.token;
    req.userid = requestObject.user.id;
    next();
  },
  dialogValidator: (req, res, next) => {
    if (!req.requestObject.callback_id == 'create_event') {
      res.status(400).send({ text: "Something went wrong, please try again."});
    }
    
    const submission = req.requestObject.submission;

    const errors = [];

    if (!submission.startdate){
      errors.push({
        "name": "startdate",
        "error": "You haven't entered a date for your event"
      });
    };

    if (!submission.title){
      errors.push({
        "name": "title",
        "error": "Your event needs a title, please enter a title for your event"
      });
    };

    if (errors.length > 0) {
      return res.send({errors})
    }


    const start = chrono.parseDate(submission.startdate);
    const stop = chrono.parseDate(submission.enddate);


    if (!start) {
      errors.push({
        "name": "startdate",
        "error": "Wrong date format, try following the hints"
      })
    }

    if (!stop) {
      errors.push({
        "name": "enddate",
        "error": "Wrong date format, try following the hints"
      })
    }

    if (errors.length > 0) {
      return res.send({errors})
    }

    next();
  }
};
