import http from "http";
import express from "express";
import bodyParser from "body-parser"
import path from "path"
import morgan from "morgan";
import slack from "./slack";
import gcalsyncer from "./gcalsync";
import routewares from "./routewares";
import mongoose from "mongoose";


const router = express();
const server = http.createServer(router);

router.use(express.static(path.resolve(__dirname, '/../client')));
router.use(express.static(path.resolve(__dirname, '/../client/pages')));
router.use(bodyParser.urlencoded( { extended: true } ));
router.use(bodyParser.json());
router.use(morgan("tiny"));

mongoose.connect(process.env.DATABASE_URI);

router.get("/success", (req, res) => { 
    return res.sendFile( __dirname + "/../client/pages/success.html");
});
router.get("/fail", (req, res) => {
    return res.sendFile( __dirname + "/../client/pages/failure.html");
});

router.get("/calendar/authorise/:id", gcalsyncer.authorise);
router.get("/calendar/authenticate", gcalsyncer.saveToken);

router.get("/slack/authorise/:id", slack.authorise);
router.get("/slack/authenticate", slack.saveToken);

router.post("/api/v1/create", routewares.tokenware,
                              routewares.slackAuthware,
                              gcalsyncer.openDialog);

router.post("/api/v1/submit-form", routewares.formTokenware,
                                   routewares.dialogValidator,
                                   routewares.slackAuthware, 
                                   gcalsyncer.create);

router.post("/api/v1/addattendee", routewares.tokenware, 
                                   routewares.slackAuthware, 
                                   routewares.slackTeamAuthware, 
                                   gcalsyncer.addattendee);

server.listen(process.env.PORT || 3000, process.env.IP, function(){
  const addr = server.address();
  console.log("GCALSYNC server listening at", addr.address + ":" + addr.port);
});

export default server;
