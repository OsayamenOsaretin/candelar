var chai = require('chai');
var spies = require('chai-spies');

chai.use(spies);

var error = '';
var response = '';

var getError = () => (error);
var setError = (errorMessage) => {
  error = errorMessage;
}

var getResponse = () => (response);
var setResponse = (event) => {
  response = event;
}
var insertFunction = (params, cb) => (cb(getError(), getResponse()))

var calendarSpy = chai.spy(insertFunction);

var postMessage = () => {
  var messagePromise = new Promise((resolve, reject) => {
    resolve({ 'tz': '' });
  });
  return messagePromise;
};

var refreshAccessToken = () => (console.log('refreshing'));
var refreshAccessTokenSpyFunction = chai.spy(refreshAccessToken);
var postMessageSpy = chai.spy(postMessage);

function OAuth2() {
  this.refreshAccessToken = refreshAccessTokenSpyFunction
};

function Event() {
  this.save = () => {
    console.log('we are not saving nada');
  };
  eventid = '';
  calendarid = '';
  postid = '';
}

var models = {
  Event
}

var gapi = {
  calendar: (version) => ({
    events: {
      insert: insertFunction
    }
  }),
  auth: {
    OAuth2
  }
}

var slack = {
  getauthedwebtoken: () => ({
    chat: {
      postMessage: postMessageSpy
    }
  })
}

module.exports = {
  setError,
  setResponse,
  gapi,
  refreshAccessTokenSpyFunction,
  slack,
  postMessageSpy,
  models 
}
