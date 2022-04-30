var db;
var mongojs 			= require('mongojs');
var Q						= require('q');
var nodemailer 		= require('nodemailer');
var smtpTransport 	= require('nodemailer-smtp-transport');
var transporter;

module.exports = function mailerModule(refdb){
	db = refdb;
	var module = {
		sendMail: sendMail
	};
	return module;
};

function defineTransporter(){
	var deferred = Q.defer();
	db.settings.findOne(function(err, result){
		if(err){
			console.log("error getting settings at defineTransporter");
			deferred.reject(err);
		} else {
			//console.log(result);
			if(result.mailtransporter == "sparkpost"){
				transporter = nodemailer.createTransport(

					smtpTransport({
						host	: result.sparkpost.host,
						port	: result.sparkpost.port,
						secure	: false,
						tls		: {
							rejectUnauthorized: false
						},
						auth	: {
							user: result.sparkpost.user,
							pass: result.sparkpost.pass
						}
					})
				);
			} else {
				transporter = nodemailer.createTransport(
					smtpTransport({
						host	: result.mailserver.host,
						port	: result.mailserver.port,
						secure	: (result.mailserver.isSecure == 'true'),
						tls		: {
							rejectUnauthorized: (result.mailserver.rejectUnauthorized == 'true')
						},
						auth	: {
							user: result.mailserver.user,
							pass: result.mailserver.pass
						}
					})
				);
			}
			deferred.resolve();
		}
	});
	return deferred.promise;
}

function sendMail(subject, content, from, to, cc, bcc, attachments, replyTo){
	var deferred = Q.defer();
	var curVals = {};
	curVals.subject 	= subject || 'No Subject';
	curVals.text 		= content || 'No Content';
	curVals.html 		= content || 'No Content';
	curVals.from		= from || 'admin@epmvirtual.com';
	curVals.to 			= to;
	//console.log("Current Values:", curVals);
	if(!curVals.to){ deferred.reject("No to addresses"); return deferred.promise; }
	if(cc) curVals.cc 	= cc;
	if(bcc) curVals.bcc = bcc;
	if(attachments) curVals.attachments = attachments;
	if(replyTo) curVals.replyTo		= replyTo;
	defineTransporter().
	then(function(){
		transporter.sendMail(curVals, function(err, info){
			if(err){
				deferred.reject(err);
			} else {
				deferred.resolve(info);
			}
		});
	}).
	fail(deferred.reject);

	return deferred.promise;
}