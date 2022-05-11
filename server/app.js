var opbeat = require('opbeat').start({
  appId: 'db76d7f643',
  organizationId: '***REMOVED***',
  secretToken: '***REMOVED***'
});

var cluster         = require( 'cluster' );
var fs 				= require("fs");

var mongojs 		= require('mongojs');
var lnconfiguration	= JSON.parse(fs.readFileSync('luckynode.conf', 'utf8'));
//console.log(lnconfiguration);
var cloudConnStr	= lnconfiguration.db.connstr;
var cloudColls		= ['users','datacenters','nodes','ipblocks','storages','nodecs','nodetokens','managers','plans','servers','images', 'imagegroups','isofiles', 'logs', 'userfiles', 'settings', 'invoices', 'counters', 'mailtemplates', 'library', 'templateDocs', 'userRequests', 'transactions', 'countries', 'cclogs'];
var db 				= mongojs(cloudConnStr, cloudColls);
//db.servers.find(function(err, result){console.log(result);});
//db.settings.find(function(err, result){console.log(result);});

var cronerpid 		= 0;
var Croner          = require('./config/config.croner.js');

if( cluster.isMaster ) {

    var croner_env = {}; croner_env.isCroner = 1;

    cronerpid = cluster.fork(croner_env).process.pid;

    cluster.on( 'online', function( worker ) {
        console.log( 'Croner ' + worker.process.pid + ' is online.' );
    });
    cluster.on( 'exit', function( worker, code, signal ) {
        console.log( 'Croner ' + worker.process.pid + ' died.' );
        cronerpid = cluster.fork(croner_env).process.pid;
    });
} else {
    var croner = new Croner(db);
}
