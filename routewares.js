var User = require('./models').User,
  Team = require('./models').Team,
  slack = require('./slack');

module.exports = {
  aware: function(q, p, n) {
    if (!q.body.token) return p.send('No token provided');
    else if (q.body.token != process.env.SLACK_TOKEN)
      return p.send('Invalid token provided');
    else p.send('Working...');

    q.person = {};

    if (q.body.event) n();
    // Send a Slack event
    else if (q.body.user_id) {
      // Send a slack command.

      // Check to see if user has already been signed up.
      var userid = q.body.user_id;

      if (!userid) return;

      var signupmessage =
        'Seems like *gcalsync* does not have access to either your workspace or calendar. Please go to ' +
        process.env.BASE_URI +
        'slack/authorise';

      User.findOne({ userid: userid }, function(er, slackuser) {
        if (er) return console.log(er);

        if (!slackuser) {
          // Send message to user with link;

          var user = new User();

          user.userid = userid;
          user.save(function(e, v) {
            if (e) console.log('An error occured while creating the user', e);

            //slack.message(userid, signupmessage);
            slack.urlmessage({
              rurl: q.body.response_url,
              message: signupmessage,
            });
          });
        } else {
          if (slackuser.slacktoken && slackuser.googletoken) {
            slack.testtokenvalid(slackuser.slacktoken).then(function(data) {
              if (data.ok) {
                q.person = {
                  access: slackuser.slacktoken,
                  userid: userid,
                  googletoken: slackuser.googletoken,
                  calendarid: slackuser.calendarid,
                };
                n();
              } else {
                slack.urlmessage({
                  rurl: q.body.response_url,
                  message: signupmessage,
                });
              }
            });
          } else {
            slack.urlmessage({
              rurl: q.body.response_url,
              message: signupmessage,
            });
          }
        }
      });
    }
  },
  bware: function(q, p, n) {
    if (!(q.body.event && q.body.event.reaction == process.env.EVENT_NAME))
      return;
    q.person.userid = q.body.event.user;
    q.person.event = {
      latest: q.body.event.item.ts,
      channel: q.body.event.item.channel,
      inclusive: true,
      count: 1,
    };

    Team.findOne({ teamid: q.body.team_id }, function(er, team) {
      if (er) return;

      slack.testtokenvalid(team.bot).then(function(data) {
        if (team) {
          q.person.access = team.bot;
          n();
        } else {
          console.log('Token event error. How...will find out later');
        }
      });
    });
  },
};

