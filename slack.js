var { WebClient } = require("@slack/client"),
    async = require("async"),
    buildurl = require("build-url"),
    authurl = "https://slack.com/oauth/authorize",
    axios = require("axios"),
    uuid = require("uuid"),
    User = require("./models").User,
    Team = require("./models").Team,
    _self,
    scope = "commands,bot,im:write,reactions:read,users.profile:read,chat:write:bot,users:read,users:read.email,chat:write:user";
    

module.exports = _self = {
    
    authorise: function(q, p, n){
        var state = uuid.v4(),
            queryParams = {
                client_id: process.env.CLIENT_ID,
                scope: scope,
                redirect_uri: process.env.BASE_URI + "slack/authenticate",
                state: state
            },
            url = buildurl(authurl, { queryParams });
            
        var user = new User();
        user.regstateid = state;
        user.save(function(e){
            if(e) console.log("Saved Reg error", e);
        });
        
        return p.redirect(url);
        
    },
    savetoken: function(q, p, n){
        var code = q.query.code, userregstate = q.query.state,
            authed = new WebClient();
        
        authed.oauth.access(process.env.CLIENT_ID, process.env.CLIENT_SECRET, code)
            .then(function(data){
                
                if(userregstate){
                    User.findOne({ regstateid: userregstate }, function(e, doc){ 
                        if(e || !doc) return p.redirect(process.env.BASE_URI + "fail");
                        
                        var authed = new WebClient(data.access_token);
                    
                        authed.auth.test()
                            .then(function(vdata){
                                
                                var userid = vdata.user_id;
                                
                                async.parallel([
                                    function(cb){
                                        User.updateOne({ regstateid: userregstate }, { $set: { userid, slacktoken: data.access_token, teamid: data.team_id } }, function(er, up){
                                            if(er) return p.send("Error saving Slack token");
                                            cb();
                                        });
                                    },
                                    function(cb){
                                        Team.updateOne({ teamid: data.team_id }, { $set: { bot: data.bot.bot_access_token } }, { upsert: true }, function(er, up){
                                            if(er) return p.send("Error saving Slack token");
                                            cb();
                                        });
                                    }], function(er, result){
                                        return p.redirect(process.env.BASE_URI + "calendar/authorise/" + userid);
                                    });
                            })
                            .catch(function(er){
                                console.log("Auth test error", er);
                            });
                    });
                }else{
                    return p.redirect(process.env.BASE_URI + "fail");
                }
            });
    },
    finduser: function(userid, token){
        var authed = _self.getauthedwebtoken(token);
        
        return authed.users.info(userid)
                    .then(function(info){ return info.user; })
                    .catch(function(e){ console.log("UserInfo Error", e); } );
    },
    getauthedwebtoken: function(token){
        return new WebClient(token);
    },
    testtokenvalid: function(token){
        var authed = new WebClient(token);
        return authed.auth.test();
    },
    message: function(token, userid, message, o){
        var authed = _self.getauthedwebtoken(token);
        
        return authed.im.open(userid)
            .then(function(d){ return authed.chat.postMessage(d.channel.id, message); })
            .then(function(f){ console.log("Private message sent.") })
            .catch(function(e){
                console.log("Error:", e);
                
                if(!o.url) return;
                
                _self.failmessage(o);
            });
    },
    urlmessage: function(o){
        axios.post(o.rurl, { response_type: o.type, text: o.message })
            .then(function(resp){
                console.log(resp.data);
            })
            .catch(function(e){
                console.log(e);
            });
    }
}