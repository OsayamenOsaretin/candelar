var chai = require("chai"),
    expect = chai.expect,
    server = require("./server"),
    gcalsync = require("./gcalsync"),
    moment = require("moment"),
    chrono = require('chrono-node'),
    slack = require("./slack"),
    spies = require('chai-spies'),
    gapi = require("googleapis"),
    calendarapi = gapi.calendar("v3"),
    OAuth2Client = gapi.auth.OAuth2,
    proxyquire = require("proxyquire"),
    oauth = new OAuth2Client( process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.BASE_URI + "calendar/authenticate" );

var mocks = require("./mocks");


chai.use(require("chai-http"));
chai.use(spies);
    
var requester = chai.request(server);
    

var createRequestObject = {
      requestObject: {
        submission: {
          title: '',
          startdate: '',
          enddate: ''
        },
        reponse_url: 'http://soque-mai-bawlls.com',
        channel: {
          id: 'test-channel-id'
        }
      },
      person: {
        googletoken: 'fake-google-token',
        userid: 'fake-user-id',
        access: 'fake-access-code'
      },
    };

describe("Candelar", function(){
    it("should fail when no token is provided", function(done){
        requester.post("/api/v1/create")
            .end(function(e, r){
                expect(e).to.be.null;
                expect(r).to.have.status(200);
                expect(r).to.be.html;
                expect(r.text).to.equal("No token provided");
                done();
            });
    });
    
    it("should fail when token is wrong", function(done){
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
    
    it("should pass when valid token is present", function(done){
        requester.post("/api/v1/create")
            .send({ token: "izvi1hVPnbnEMZyeXsDpe3Z2", event: { reaction: "gcalsync" } })
            .end(function(e, r){
                expect(e).to.be.null;
                expect(r).to.have.status(200);
                done();
            });
    });
    
  
    // gcalsync tests
  
    // create
    it("should only call slack.finduser when title and description are provided to create", function(done) {
        var spy = chai.spy.on(slack, 'finduser');
        var req = createRequestObject;
        gcalsync.create(req, {}, () => {});
        expect(slack.finduser).to.not.have.been.called();
        req.requestObject.submission.title = 'An Event';
        req.requestObject.submission.startdate = '01/01/01';
        gcalsync.create(req, {}, () => {});
        expect(slack.finduser).to.have.been.called();
        done();
    });
  
    //createevent
    it("should refresh token when calendar insert fails", function(done) {
        var req = createRequestObject;
        req.requestObject.submission.startdate = 'today at 4pm';
        req.requestObject.submission.enddate= 'today at 4pm';
        req.requestObject.submission.title = 'An Event';
      
        mocks.setError(new Error('An Error'));
      
        var mockGapi = mocks.gapi;
      
        var authSpy = mocks.refreshAccessTokenSpyFunction;
        
      
        var proxiedGcalSync = proxyquire('./gcalsync', { 'googleapis': mockGapi });
        proxiedGcalSync.createevent(req, req.requestObject, {tz: ''});
        expect(authSpy).to.have.been.called();
        done();
    });
    it("should send success message when event is successfully created", function(done) {
        var req = createRequestObject;
        req.requestObject.submission.startdate = 'today at 4pm';
        req.requestObject.submission.enddate= 'today at 4pm';
        req.requestObject.submission.title = 'An Event';
      
        var event = {
          data: {
            summary: 'An Event',
            descritpion: 'An Event\'s description',
            id: 'created-id',
            creator: {
              email: 'testemail@email.com',
            }
          }
        }
        var postMessageSpy = mocks.postMessageSpy;
      
        mocks.setResponse(event);
        mocks.setError('');

      var proxiedGcalSync = proxyquire('./gcalsync', { './slack': mocks.slack, 'googleapis': mocks.gapi, './models': mocks.models });
        proxiedGcalSync.createevent(req, req.requestObject, {tz: ''}).then(() => {
          expect(postMessageSpy).to.have.been.called();
          done();
        });
    });
});
