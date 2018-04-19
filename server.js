var http = require('http'),
    bodyParser = require("body-parser"),
    path = require('path'),
    express = require('express'),
    router = express(),
    server = http.createServer(router),
    morgan = require("morgan"),
    slack = require("./slack"),
    gcalsyncer = require("./gcalsync"),
    routewares = require("./routewares"),
    mongoose = require("mongoose");

router.use(express.static(path.resolve(__dirname, 'client')));
router.use(express.static(path.resolve(__dirname, 'client/pages')));
router.use(bodyParser.urlencoded( { extended: true } ));
router.use(bodyParser.json());
router.use(morgan("tiny"));

mongoose.connect(process.env.DATABASE_URI);

router.get("/success", function(q, p, n){ 
  return p.sendFile( __dirname + "/client/pages/success.html");
});
router.get("/fail", function(q, p, n){
  return p.sendFile( __dirname + "/client/pages/failure.html");
});

router.get("/calendar/authorise/:id", gcalsyncer.authorise);
router.get("/calendar/authenticate", gcalsyncer.savetoken);

router.get("/slack/authorise", slack.authorise);
router.get("/slack/authenticate", slack.savetoken);

router.post("/api/v1/create", routewares.aware, gcalsyncer.create);

router.post("/api/v1/addattendee", routewares.aware, routewares.bware, gcalsyncer.addattendee);

server.listen(process.env.PORT || 3000, process.env.IP || "0.0.0.0", function(){
  var addr = server.address();
  console.log("GCALSYNC server listening at", addr.address + ":" + addr.port);
});

module.exports = server;

// Event body

// { token: 'izvi1hVPnbnEMZyeXsDpe3Z2',
//   team_id: 'T8UCG4400',
//   api_app_id: 'A8VTN09FY',
//   event: 
//   { type: 'reaction_added',
//     user: 'U8V26FVBL',
//     item: 
//       { type: 'message',
//         channel: 'C8V7DHMDK',
//         ts: '1516359611.000178' },
//     reaction: 'gcalsync',
//     item_user: 'U8V26FVBL',
//     event_ts: '1516376962.000358' },
//   type: 'event_callback',
//   event_id: 'Ev8VMF8C3F',
//   event_time: 1516376962,
//   authed_users: [ 'U8V26FVBL' ] }


// Command body
// { token: 'izvi1hVPnbnEMZyeXsDpe3Z2',
//   team_id: 'T8UCG4400',
//   team_domain: 'gcalsync',
//   channel_id: 'C8V7DHMDK',
//   channel_name: 'gsync',
//   user_id: 'U8V26FVBL',
//   user_name: 'cozzbie',
//   command: '/gcalsync',
//   text: 'hello',
//   response_url: 'https://hooks.slack.com/commands/T8UCG4400/301571494065/TUnifStQLdb95eGmfYpd6we1',
//   trigger_id: '302020453763.300424140000.1755c6d0f8c0a2eaef82270b00a61f00' }


//Slack token
// { ok: true,
//   access_token: 'xoxp-300424140000-301074539394-301135451586-eb6f9d3751b03756948d7f6c71af1b44',
//   scope: 'identify,commands,reactions:read,users:read,users:read.email,users.profile:read,chat:write:bot',
//   user_id: 'U8V26FVBL',
//   team_name: 'Playground',
//   team_id: 'T8UCG4400' }