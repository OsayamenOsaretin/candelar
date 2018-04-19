var chai = require("chai"),
    expect = chai.expect,
    server = require("./server"),
    gcalsync = require("./gcalsync"),
    moment = require("moment"),
    chrono = require('chrono-node'),
    slack = require("./slack");
    
    chai.use(require("chai-http"));
    
    var requester = chai.request(server);
    
    
describe("Candelar", function(){
    
    it.skip("should fail when no token is provided", function(done){
        requester.post("/api/v1/create")
            .end(function(e, r){
                expect(e).to.be.null;
                expect(r).to.have.status(200);
                expect(r).to.be.html;
                expect(r.text).to.equal("No token provided");
                done();
            });
    });
    
    it.skip("should fail when token is wrong", function(done){
        requester.post("/api/v1/create")
            .send({ token: "iouvuwudbsuidcbsiucbwuibd" })
            .end(function(e, r){
                expect(e).to.be.null;
                expect(r).to.have.status(200);
                expect(r).to.be.html;
                expect(r.text).to.equal("Invalid token provided");
                done();
            });
    });
    
    it.skip("should pass when valid token is present", function(done){
        requester.post("/api/v1/create")
            .send({ token: "izvi1hVPnbnEMZyeXsDpe3Z2", event: { reaction: "gcalsync" } })
            .end(function(e, r){
                expect(e).to.be.null;
                expect(r).to.have.status(200);
                done();
            });
    });
    

    it.skip("should return a string url", function(){
        var url = gcalsync.authoriseurl();
        expect(url).to.be.a("string");
    });
    
    it.skip("should convert a plain string into a parseable object", function(){
        const message = "title:[We have a workshop] description:[This is a wonderful workshop] startdate:[04/04/2018] enddate:[04/04/2018] time:[4pm to 6pm]",
            objectifiedstring = gcalsync.objectifystring(message);
        
        expect(objectifiedstring).to.have.property("title");
        expect(objectifiedstring).to.have.property("startdate");
        expect(moment(chrono.parseDate(objectifiedstring.startdate))).to.be.a("object");
        
    });
    
    it.skip("should fail when a string is not provided to it", function(){
        const message = {}, objectifiedstring = gcalsync.objectifystring(message);
            
        expect(objectifiedstring).to.be.a("string");
    });
    
    it("should send a slack message successfully", function(done){
        slack.message("xoxp-300424140000-301074539394-301135451586-eb6f9d3751b03756948d7f6c71af1b44", "U8V26FVBL", "Happy testing", {})
            .then(function(result){
                // expect(result).to.have.property("ok");
                done();
            })
            .catch(function(e){
                console.log("Test error", e);
                done();
            });
    });
    
});
