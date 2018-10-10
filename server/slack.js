import { WebClient } from "@slack/client";
import asycn from "async";
import buildUrl from "build-url";
import axios from "axios";
import uuid from "uuid";
import models from "./models";

const scope = "commands,bot,im:write,reactions:read,users.profile:read,chat:write:bot,users:read,users:read.email,chat:write:user";
const authUrl = "https://slack.com/oauth/authorize";

const User = models.User;
const Team = models.Team;
let _self;

const slack = _self = {
  authorise: (req, res) => {
    const userId = req.params.id.toUpperCase();
    let state;

    // Find the user if stored in the database and update the reg state.
    User.findOne({ userid: userId }, (err, doc) => {
      if (err) return console.log("Error finding user"); 
      if (!doc) {
        state = uuid.v4();
        const user = new User();
        user.regstateid = state;
        user.userid = userId;
        user.save((error) => {
          if(error) console.log("Saved Reg error", error);
        });
      } else {
        state = doc.regstateid;
      }

      const queryParams = {
        client_id: process.env.CLIENT_ID,
        scope: scope,
        redirect_uri: process.env.BASE_URI + "slack/authenticate",
        state: state
      };

      const url = buildUrl(authUrl, { queryParams }); 
      return res.redirect(url);
    });
  },
  saveToken: (req, res) => {
    if (!req.query.code) {
      return res.redirect(process.env.BASE_URI + "fail")
    }
    const code = req.query.code;
    const userState = req.query.state;
    const authed = new WebClient();

    authed.oauth.access(process.env.CLIENT_ID, process.env.CLIENT_SECRET, code)
      .then((data) => {
        if(userState){
          User.findOne({ regstateid: userState }, (err, doc) => { 
            if(err || (!doc && userState != process.env.STATE)) {
              return res.redirect(process.env.BASE_URI + "fail");
            }

            const authed = new WebClient(data.access_token);

            authed.auth.test()
              .then((verifiedData) => {
                const userid = verifiedData.user_id;
                
                async.parallel([
                  (cb) => {
                    User.updateOne(
                      { regstateid: userState }, 
                      { $set: { userid, slacktoken: data.access_token, 
                                teamid: data.team_id } }, 
                      (error) => {
                        if(error) return res.send("Error saving Slack token");
                        cb();
                      });
                  },
                  (cb) => {
                    Team.updateOne(
                      { teamid: data.team_id }, 
                      { $set: { bot: data.bot.bot_access_token } }, 
                      { upsert: true }, 
                      (error) => {
                        if(error) return res.send("Error saving Slack token");
                        cb();
                      });
                  }], (error, result) => {
                    return res.redirect(process.env.BASE_URI + 
                                        "calendar/authorise/" + 
                                        userid);
                  });
              })
              .catch((er) => {
                console.log("Auth test error", er);
              });
          });
        }else{
          return res.redirect(process.env.BASE_URI + "fail");
        }
      }).
      catch((error) => {
        console.log('Some Auth error', error);
      });
  },
  finduser: (userId, token) => {
    const authed = _self.getAuthedWebtoken(token);

    return authed.users.info(userId)
      .then((info) => { return info.user; })
      .catch((error) => { console.log("UserInfo Error", error); } );
  },
  getAuthedWebtoken: (token) => (new WebClient(token)),
  testTokenValid: (token) => {
    const authed = new WebClient(token);
    return authed.auth.test();
  },
  message: (token, userId, message, output) => {
    const authed = _self.getauthedwebtoken(token);

    return authed.im.open(userId)
      .then((data) =>(authed.chat.postMessage(data.channel.id, message)))
      .then((result) => (console.log("Private message sent.")))
      .catch((error) =>{
        console.log("Error:", error);
        if(!output.url) return;

        // TODO: right fail message handler
        _self.failMessage(output);
      });
  },
  urlMessage: (output) => {
    axios.post(output.rurl, { response_type: output.type, text: output.message })
      .then((res) => {
        console.log(res.data);
      })
      .catch((error) => {
        console.log(error);
      });
  }
}

export default slack;
