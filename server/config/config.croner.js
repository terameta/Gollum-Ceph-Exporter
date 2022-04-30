var backupModule;
var moment			= require('moment');

module.exports = function Croner(db) {
	var croner				= require('cron').CronJob;
	
	backupModule = require("../modules/modules.backup.js")(db);
	
	backupModule.processAll();
	
	/*
	var jobS = new croner(
		'* * * * * *',
		function(){
			console.log(moment().format());
		}, function(){
			console.log("This is the end of every ten seconds");
		},
		true,
		"America/Los_Angeles"
	);
	
	var jobM = new croner(
		'0 * * * * *',
		function(){
			backupModule.processAll();
		}, function(){
			console.log("This is the end of every ten seconds");
		},
		true,
		"America/Los_Angeles"
	);
	*/
	module.exports = Croner;
};