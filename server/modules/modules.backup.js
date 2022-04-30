var db;
var tools;
var Q 				= require("q");
var mongojs 		= require('mongojs');
var moment			= require('moment');
var fs 				= require('fs');
var mailer;

module.exports = function(refdb){
	db = refdb;
	tools = require("../tools/tools.main.js")(db);
	mailer = require("../tools/tools.mailer.js")(db);
	var module = {
		processAll 			: processAll
	};
	return module;
};

function processAll(){
	var deferred = Q.defer();
	console.log("Processing all");
	db.storages.find({name:"rbd"}, function(err, storages){
		if(err) {
			console.log(err);
			deferred.reject(err);
		} else {
			storages.forEach(function(curStore){
				var refObj = {poolname:curStore.name, poolid: curStore._id.toString()};
				rbdList(refObj).
			//	then(clearBackupDates). 			//Remove this line for regular backup procedure
			//	then(prepareB2).
				then(rbdDetails).
				then(dbDetails).
				then(prepareFolders).
				then(decideUpload).
				then(exportUpload).
				then(clearExtranaous).
				then(function(result){
					sendResults(result, "Success", true, 60);
				}).
				fail(function(issue){
					refObj.failure = issue;
					sendResults(refObj, "Failed", true);
					sendResults(issue, "Failed", false);
				});
			});
			deferred.resolve();
		}
	});
	return deferred.promise;
}

function clearExtranaous(refObj){
	var deferred = Q.defer();
	for(var i = 0; i < refObj.items.length; i++){
		delete refObj.items[i].dbinfo;
		delete refObj.items[i].info;
	}
	deferred.resolve(refObj);
	return deferred.promise;
}

function prepareB2(refObj){
	var deferred = Q.defer();
	db.settings.findOne(function(err, settings){
		if(err){
			deferred.reject(err);
		} else {
			tools.runLocalCommand("b2 authorize_account "+ settings.backblaze.accountid + " " + settings.backblaze.applicationkey).
			then(function(result){
				deferred.resolve(refObj);
			}).
			fail(deferred.reject);
		}
	});
	return deferred.promise;
}

function clearBackupDates(refObj){
	var deferred = Q.defer();
	clearBackupDatesIsofiles().
	then(clearBackupDatesImages).
	then(clearBackupDatesServers).
	then(function(){ deferred.resolve(refObj)}).
	fail(deferred.reject);
	return deferred.promise;
}

function clearBackupDatesIsofiles(){
	var deferred = Q.defer();
	db.isofiles.update({}, {$unset:{lastbackupdate:""}}, {multi: true}, function(err, result){
		if(err){
			deferred.reject(err);
		} else {
			deferred.resolve();
		}
	});
	return deferred.promise;
}

function clearBackupDatesServers(){
	var deferred = Q.defer();
	db.servers.update({}, {$unset:{lastbackupdate:""}}, {multi: true}, function(err, result){
		if(err){
			deferred.reject(err);
		} else {
			deferred.resolve();
		}
	});
	return deferred.promise;
}

function clearBackupDatesImages(){
	var deferred = Q.defer();
	db.images.update({}, {$unset:{lastbackupdate:""}}, {multi: true}, function(err, result){
		if(err){
			deferred.reject(err);
		} else {
			deferred.resolve();
		}
	});
	return deferred.promise;
}

function prepareFolders(refObj){
	var deferred = Q.defer();
	tools.runLocalCommand("mkdir -p currentprocess").then(function(result){
		console.log("Prepare Folders Result:", result);
		deferred.resolve(refObj);
	}).fail(deferred.reject);
	return deferred.promise;
}

function decideUpload(refObj){
	var deferred = Q.defer();
	console.log("Decide Upload # of items: ", refObj.items.length);
	for(var i = 0; i < refObj.items.length; i++){
		//Below if marks the item to be not backedup because it is not in our database. Also, puts a warning to backup email message.
		if(!refObj.items[i].dbinfo){
			refObj.items[i].dbinfo = {lastbackupdate:moment().toDate()};
			refObj.items[i].backupnotes.push({issue: "We don't have a db entry for this item"});
		} 
		var curDate = moment();
		var dbDate;
		if(refObj.items[i].dbinfo.lastbackupdate){
			dbDate = moment(refObj.items[i].dbinfo.lastbackupdate);
		} else {
			dbDate = null;
		}
		
		refObj.items[i].shouldBackup = true;
		
		if(refObj.items[i].itemtype == "iso"){
			if(dbDate) refObj.items[i].shouldBackup = false;
		} else if(refObj.items[i].itemtype == "image"){
			if(dbDate) refObj.items[i].shouldBackup = false;
		} else if(refObj.items[i].itemtype == "disk"){
			//console.log("We are at disk decide");
			//console.log(dbDate);
			//console.log("Diff is:", curDate.diff(dbDate, "days", true));
			if(dbDate){
				if(curDate.diff(dbDate, "days", true) < 7) refObj.items[i].shouldBackup = false;
			} 
		} else {
			refObj.items[i].shouldBackup = false;
		}
		
		//Delete below line for production
		//if(refObj.items[i].name != "CentOS-6.6-x86_64-minimal.iso") refObj.items[i].shouldBackup = false;
	}
	deferred.resolve(refObj);
	return deferred.promise;
}

function exportUpload(refObj){
	var deferred = Q.defer();
	console.log("We are at export and upload");
	console.log(refObj.items.length);
	if(refObj.items.length > 0){
		deferred.resolve(exportUploadAction(refObj, 0));
	} else {
		deferred.resolve(refObj);
	}
	return deferred.promise;
}

function exportUploadAction(refObj, curIndex){
	var deferred = Q.defer();
	
	
	if(refObj.items[curIndex]){
		var curItem = refObj.items[curIndex];
		var curDater = moment().format("YYYYMMDD");
		console.log("Handling:", curIndex, curItem.itemtype, curItem.name, curDater);
		var cmdList = [];
		
		if(curItem.shouldBackup){
			if(curItem.itemtype == "iso"){
				fs.writeFileSync("currentprocess/"+curItem.name+".json", JSON.stringify(curItem, null, 3), "utf8");
				//cmdList.push("cd currentprocess && rar a -ma -m3 "+curItem.name+".rar "+curItem.name+".json");
				cmdList.push("cd currentprocess && rbd export --rbd-concurrent-management-ops 1 "+curItem.address+" - | rar a -v100g -si "+curItem.name+" -ma -m3 "+curItem.name+".rar");
				//cmdList.push("cd currentprocess && rm *.json");
				//refObj.items[curIndex].b2command = "cd currentprocess && b2 upload_file --noProgress evisofiles "+curItem.name+".rar "+curItem.name+".rar";
				// refObj.items[curIndex].b2command = "cd currentprocess && for i in *; do rclone move -v --log-file ../rclone.log --bwlimit=8M ./$i amazonepm:/evbackup/iso;done";
				// refObj.items[curIndex].b2command = "cd currentprocess && for i in *; do rclone move -v --log-file ../rclone.log --bwlimit=8M ./$i amazonepm:/evbackup/iso;done";
				refObj.items[curIndex].b2command = "cd currentprocess && for i in *; do mv ./$i ../../thebackupfolder;done";
			} else if(curItem.itemtype == "image"){
				fs.writeFileSync("currentprocess/"+curItem.name+".json", JSON.stringify(curItem, null, 3), "utf8");
				//cmdList.push("cd currentprocess && rar a -ma -m3 "+curItem.name+".rar "+curItem.name+".json");
				cmdList.push("cd currentprocess && rbd export --rbd-concurrent-management-ops 1 "+curItem.address+" - | rar a -v100g -si"+curItem.name+".full -ma -m3 "+curItem.name+".rar");
				//cmdList.push("cd currentprocess && rm *.json");
				//refObj.items[curIndex].b2command = "cd currentprocess && b2 upload_file --noProgress evimages "+curItem.name+".rar "+curItem.name+".rar";
				refObj.items[curIndex].b2command = "cd currentprocess && for i in *; do mv ./$i ../../thebackupfolder;done";
			} else if(curItem.itemtype == "disk"){
				fs.writeFileSync("currentprocess/"+curItem.name+".json", JSON.stringify(curItem, null, 3), "utf8");
				cmdList.push("cd currentprocess && rbd snap create --snap backupsnap "+curItem.address);
				//cmdList.push("cd currentprocess && rar a -ma -m3 "+curDater+"-"+curItem.dbinfo.owner+"-"+curItem.name+".rar "+curItem.name+".json");
				cmdList.push("cd currentprocess && rbd export --rbd-concurrent-management-ops 1 "+curItem.address+"@backupsnap - | rar a -v100g -si"+curItem.name+".full -ma -m3 "+curDater+"-"+curItem.dbinfo.owner+"-"+curItem.name+".rar");
				cmdList.push("cd currentprocess && rbd snap rm "+curItem.address+"@backupsnap");
				//cmdList.push("cd currentprocess && rm *.json");
				cmdList.push("cd currentprocess && mv "+curItem.name+".json "+curDater+"-"+curItem.dbinfo.owner+"-"+curItem.name+".json");
				
				curItem.dbinfo.name = curItem.dbinfo.name.replace(/[^A-Z0-9]/ig, "_");
				//refObj.items[curIndex].b2command = "cd currentprocess && b2 upload_file --noProgress --info servername="+curItem.dbinfo.name+" --info owner="+curItem.dbinfo.owner+" evdisks "+curItem.name+"-"+curDater+".rar "+curItem.name+"-"+curDater+".rar";
				refObj.items[curIndex].b2command = "cd currentprocess && for i in *; do rclone move -v --log-file ../rclone.log --bwlimit=8M ./$i EPMGSuite:/evbu/disk;done";
				// refObj.items[curIndex].b2command = "cd currentprocess && for i in *; do mv ./$i ../../thebackupfolder;done";
			} else {
				console.log("This is other");
			}
			
			cleanupStart(refObj.items[curIndex]).
			then(function(){ 		console.log("Cleanup finished");	return writeJSONFile(refObj.items[curIndex]);						}).
			then(function(){ 		return tools.runLocalCommands(cmdList);																			}).
			then(function(){ 		return uploadToB2(refObj.items[curIndex]);																		}).
			//then(function(){ 		return clearFolder(refObj.items[curIndex])																		}).
			then(function(){ 		return setLastBackupDate(refObj.items[curIndex]); 																}).
			//then(clearb2).
			then(function(){ 		deferred.resolve(exportUploadAction(refObj,++curIndex)); 													}).
			fail(deferred.reject);
		} else {
			console.log(refObj.items[curIndex].name, "No need to backup");
			deferred.resolve(exportUploadAction(refObj,++curIndex));
		}
	} else {
		deferred.resolve(refObj);
	}
	return deferred.promise;
}

function writeJSONFile(curItem){
	var deferred = Q.defer();
	fs.writeFileSync("currentprocess/"+curItem.name+".json", JSON.stringify(curItem, null, 3), "utf8");
	deferred.resolve();
	return deferred.promise;
}

function cleanupStart(curItem){
	console.log("Cleaning up");
	var deferred = Q.defer();
	var cmdList = [];
	cmdList.push("cd currentprocess && sudo rm *");
	tools.runLocalCommands(cmdList).
	then(deferred.resolve).
	fail(deferred.resolve);
	return deferred.promise;
}

function uploadToB2(curItem){
	var deferred = Q.defer();
	if(!curItem.b2numberofTries) curItem.b2numberofTries = 0;
	if(curItem.b2numberofTries > 10){
		deferred.reject("Too many tries to upload to b2");
	} else {
		tools.runLocalCommand(curItem.b2command).
		then(deferred.resolve).
		fail(function(issue){
			console.log("Upload to b2 failed");
			++curItem.b2numberofTries;
			console.log("Current Number of Tries:", curItem.b2numberofTries);
			curItem.backupnotes.push({issue: "b2 upload failed", error: issue});
			setTimeout(function(){
				deferred.resolve(uploadToB2(curItem));
			}, 60000);
		});
	}
	return deferred.promise;
}

function clearFolder(curItem){
	return tools.runLocalCommand("cd currentprocess && rm *");
}

function clearb2(){
	var cmdList = [];
	cmdList.push("b2 cancel_all_unfinished_large_files evdisks");
	cmdList.push("b2 cancel_all_unfinished_large_files evimages");
	cmdList.push("b2 cancel_all_unfinished_large_files evisofiles");
	return tools.runLocalCommands(cmdList);
}

function setLastBackupDate(curItem){
	var deferred = Q.defer();
	console.log(">>>>>>>>>>>>>>>>>>>Set Last Backup Date>>>", curItem.name, curItem.itemtype, curItem.dbinfo._id);
	var curDate = moment().toDate();
	if(curItem.itemtype == "iso" && curItem.dbinfo._id){
		db.isofiles.update({_id:mongojs.ObjectID(curItem.dbinfo._id)}, {$set:{lastbackupdate:curDate}}, function(err, result){
			if(err) {
				curItem.backupnotes.push({issue: "lastbackupdate failed", error: err});
			} else {
				curItem.backupnotes.push({note: "lastbackupdate is set", date: curDate});
			}
			deferred.resolve();
		});
	} else if(curItem.itemtype == "disk" && curItem.dbinfo._id){
		db.servers.update({_id:mongojs.ObjectID(curItem.dbinfo._id)}, {$set:{lastbackupdate:curDate}}, function(err, result){
			if(err) {
				curItem.backupnotes.push({issue: "lastbackupdate failed", error: err});
			} else {
				curItem.backupnotes.push({note: "lastbackupdate is set", date: curDate});
			}
			deferred.resolve();
		});
	} else if(curItem.itemtype == "image" && curItem.dbinfo._id){
		db.images.update({_id:mongojs.ObjectID(curItem.dbinfo._id)}, {$set:{lastbackupdate:curDate}}, function(err, result){
			if(err) {
				curItem.backupnotes.push({issue: "lastbackupdate failed", error: err});
			} else {
				curItem.backupnotes.push({note: "lastbackupdate is set", date: curDate});
			}
			deferred.resolve();
		});
	} else {
		deferred.resolve();
	}
	
	return deferred.promise;
}

function sendResults(refObj, mainstat, shouldRestart, theMinutes){
	console.log("Sending results");
	mailer.sendMail("Backup Result:"+moment().format()+" "+mainstat, "<html><body><pre>"+JSON.stringify(refObj, null, 3)+"</pre></body></html>", "admin@epmvirtual.com", "admin@epmvirtual.com").then(function(result){
		//console.log(result);
		console.log("Results sent.");
	}).fail(function(issue){
		console.log(issue);
	});
	if(shouldRestart){
		var delayer = theMinutes || 1;
		delayer = delayer * 60000;
		setTimeout(function(){
			processAll();
		}, delayer);
	}
}

function dbDetails(refObj){
	var deferred = Q.defer();
	var promises = [];
	refObj.items.forEach(function(curItem, curIndex){
		//console.log(curItem.name, curItem.name.substr(curItem.name.length-4));
		if( curItem.name.substr(curItem.name.length-4) == ".iso"){
			refObj.items[curIndex].itemtype = "iso";
			promises.push(dbDetailActionISO(refObj.items[curIndex]));
		} else if( curItem.name.substr(0,5) == "disk-" ){
			refObj.items[curIndex].itemtype = "disk";
			promises.push(dbDetailActionDisk(refObj.items[curIndex]));
		} else if( curItem.name.substr(0,6) == "image-" ){
			refObj.items[curIndex].itemtype = "image";
			promises.push(dbDetailActionImage(refObj.items[curIndex]));
		}
	});
	Q.all(promises).
		then(function(){ deferred.resolve(refObj); }).
		fail(deferred.reject);
	return deferred.promise;
}

function dbDetailActionISO(refObj){
	var deferred = Q.defer();
	db.isofiles.findOne({pool:refObj.poolid, file:refObj.name}, function(err, isofile){
		if(err){
			deferred.reject(err);
		} else {
			refObj.dbinfo = isofile;
			deferred.resolve(refObj);
		}
	});
	return deferred.promise;
}

function dbDetailActionDisk(refObj){
	var deferred = Q.defer();
	db.servers.findOne({_id:mongojs.ObjectID(refObj.name.substr(5,24))}, function(err, server){
		if(err){
			deferred.reject(err);
		} else {
			refObj.dbinfo = server;
			deferred.resolve(refObj);
		}
	});
	return deferred.promise;
}

function dbDetailActionImage(refObj){
	var deferred = Q.defer();
	db.images.findOne({_id:mongojs.ObjectID(refObj.name.substr(6,24))}, function(err, image){
		if(err){
			deferred.reject(err);
		} else {
			refObj.dbinfo = image;
			deferred.resolve(refObj);
		}
	});
	return deferred.promise;
}

function rbdList(refObj){
	var deferred = Q.defer();
	
	if(!refObj){ deferred.reject("No refObj passed."); return deferred.promise; }
	
	//console.log("We are listing files for", refObj.poolname);
	var curCommand = "rbd ls -l -p "+refObj.poolname;
	//console.log(curCommand);
	tools.runLocalCommand(curCommand).
	then(function(result){
		refObj.items = prepareList(result);
		var shouldFail = false;
		for(var i = 0; i < refObj.items.length; i++){
			refObj.items[i].NAME = refObj.items[i].NAME.toString().trim();
			//console.log(refObj.items[i].NAME, refObj.items[i].NAME.substr(refObj.items[i].NAME.length-11), refObj.poolname, refObj.items[i]);
			if(refObj.items[i].NAME.substr(refObj.items[i].NAME.length-11) == "@backupsnap"){
				shouldFail = true;
				tools.runLocalCommand("rbd snap rm "+refObj.poolname+"/"+refObj.items[i].NAME).then(console.log).fail(console.log);
			}
			refObj.items[i].backupnotes = [];
		}
		if(shouldFail){
			console.log("=======================================================");
			console.log("There are preexisting backupsnaps");
			deferred.reject("There are preexisting backupsnaps");
		} else {
			deferred.resolve(refObj);
		}
	}).
	fail(function(issue){
		console.error(issue);
		deferred.reject(issue);
	});
	
	return deferred.promise;
}

function rbdDetails(refObj){
	var deferred = Q.defer();
	var promises = [];
	console.log("Getting details for "+refObj.items.length+" items.");
	refObj.items.forEach(function(curItem, curIndex){
		refObj.items[curIndex].name = curItem.NAME;
		delete refObj.items[curIndex].NAME;
		refObj.items[curIndex].pool = refObj.poolname;
		refObj.items[curIndex].poolid = refObj.poolid;
		refObj.items[curIndex].address = refObj.poolname+'/'+refObj.items[curIndex].name;
		refObj.items[curIndex].parentitem = curItem.PARENT;
		delete refObj.items[curIndex].PARENT;
		refObj.items[curIndex].size = curItem.SIZE;
		delete refObj.items[curIndex].SIZE;
		refObj.items[curIndex].format = curItem.FMT;
		delete refObj.items[curIndex].FMT;
		refObj.items[curIndex].isProtected = (curItem.PROT == 'yes');
		delete refObj.items[curIndex].PROT;
		refObj.items[curIndex].isLocked = (curItem.LOCK == 'yes');
		delete refObj.items[curIndex].LOCK;
		delete refObj.items[curIndex].original;
		
		promises.push(rbdDetail(refObj.items[curIndex], curIndex));
	});
	Q.all(promises).
		then(function(){ 
			deferred.resolve(refObj);
		}).
		fail(deferred.reject);
	return deferred.promise;
}

function rbdDetail(refObj, curWait){
	var deferred = Q.defer();
	curWait = curWait * 100;
	setTimeout(function(){
		rbdDetailAction(refObj, curWait).then(deferred.resolve).fail(deferred.reject);
	}, curWait);
	return deferred.promise;
}

function rbdDetailAction(refObj, curWait){
	var deferred = Q.defer();
	tools.runLocalCommand("rbd info "+refObj.address).
	then(function(result){
		refObj.info = result;
		//console.log("resolved", curWait);
		deferred.resolve(refObj);
	}).fail(function(issue){
		console.log("failed", curWait, issue);
		deferred.reject(issue);
	});
	return deferred.promise;
}

function prepareList(result){
	var lines = result.split('\n');
	
	if(lines.length == 0){
		return [];
	} else {
		var numCols = 0;
		lines.forEach(function(curLine, curIndex){
			if(curLine.length > 0){
				//console.log(curLine, curLine.length, '|'+curLine[39]+'|');
				if(curLine.length > numCols) numCols = curLine.length;
			}
		});
		//console.log(numCols);
		var isAllSpace = true;
		var allSpaces = [];
		for(var i = 0; i < numCols; i++){
			isAllSpace = true;
			lines.forEach(function(curLine, curIndex){
				if(curLine.length > 0){
					if(curLine[i] != ' ') isAllSpace = false;
				}
			});
			//console.log(i, isAllSpace);
			if(isAllSpace) allSpaces.push(i);
		}
		//console.log(allSpaces);
		//console.log(lines[0]);
		var headers = [];
		for(var h = 0; h < allSpaces.length; h++){
			var start = 0;
			if(h > 0) start = allSpaces[h-1];
			var end = allSpaces[h];
			headers.push(lines[0].substring(start, end).trim());
		}
		//console.log(headers);
		var toReturn = [];
		for(var l = 1; l < lines.length; l++){
			
			if(lines[l].length > 0){
				var toPush = {};
				
				for(var ho = 0; ho < allSpaces.length; ho++){
					var lstart = 0;
					if(ho > 0) lstart = allSpaces[ho-1];
					var lend = allSpaces[ho];
					toPush[headers[ho]] = lines[l].substring(lstart, lend).trim();
					toPush.original = lines[l];
				}
				
				toReturn.push(toPush);
			}
			
		}
		return(toReturn);
	}
}