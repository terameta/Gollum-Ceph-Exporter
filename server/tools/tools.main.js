var db;
var Q 				= require("q");
var exec 			= require('child_process').exec;
var mongojs 		= require('mongojs');

module.exports = function(refdb){
	db = refdb;
	var module = {
		runLocalCommand 	: runLocalCommand,
		runLocalCommands 	: runLocalCommands
	};
	return module;
};

function runLocalCommand(command, resolveTo){
	var deferred = Q.defer();
	console.log("Local Command:", command);
	exec(command, function(error, stdout, stderr){
		if(error){
			console.log("runLocalCommand failed");
			console.log("error", error);
			console.log("stdout", stdout);
			console.log("stderr", stderr);
			deferred.reject(stderr);
		} else {
			if(resolveTo){
				deferred.resolve(resolveTo);
			} else {
				deferred.resolve(stdout);
			}
		}
	});
	return deferred.promise;
}

function runLocalCommands(commandList){
	var deferred = Q.defer();
	if(commandList.length > 0){
		var curCommand = commandList.shift();
		runLocalCommand(curCommand).then(
			function(){
				runLocalCommands(commandList).then(
					function(result){
						deferred.resolve(result);
					}
				).fail(
					function(issue){
						deferred.reject(issue);
					}
				);
			}
		).fail(
			function(issue){ 
				deferred.reject(issue); 
			}
		);
	} else {
		deferred.resolve('');
	}
	
	return deferred.promise;
}
