// Import the page-mod API
var pageMod = require("sdk/page-mod");
// Import the self API
var self = require("sdk/self");
 
// Create a page mod
// It will run a script whenever a ".org" URL is loaded
// The script replaces the page contents with a message
pageMod.PageMod({
  include: "*.twitch.tv",
  contentScriptFile: [ 
  	self.data.url("jquery-1.11.1.min.js"),
  	self.data.url("jquery-ui.min.js"),
  	self.data.url("script.js")
  ],
  contentStyleFile: [ 
  	require("sdk/self").data.url("styles.css"),
  	require("sdk/self").data.url("jquery-ui.css")
  ]
});