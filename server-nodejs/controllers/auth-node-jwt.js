var express = require('express');
var router = express.Router();
var expressJwt = require('express-jwt');
var jwt = require("jsonwebtoken");
var unless = require('express-unless');
var crypto = require('crypto');
var debug = require('debug')('app:routes:auth:' + process.pid);
var conf = require('../conf.json');
var bodyParser = require( 'body-parser' );

router.use( bodyParser.urlencoded() );

var authenticate = function (req, res, next) {
	debug("Processing authenticate middleware");
	if (!req.body.username || !req.body.password)
	{
		debug('no username or password');
		return res.status(401).json('Invalid username or password');
	}
	mod.search({"username": req.body.username }, function( err, doc ){
		if (err || doc.length === 0)
		{
			return res.status(401).json('Invalid username or password');
		}
		mod.readOne(doc[0], function(err, user){
			if (crypto.createHash(conf.jwt.passwordHashAlgorithm).update(req.body.password).digest('hex') !== user.password)
			{
				return res.status(401).json('Invalid username or password');
			}
			debug("User authenticated, generating token");
			user.token = jwt.sign({ _id: user._id, username: user.username }, conf.jwt.secret, { expiresInMinutes: conf.jwt.exp });
			var decoded = jwt.decode(user.token);
			user.token_exp = decoded.exp;
			user.token_iat = decoded.iat;
			delete user.password;
			debug("Token generated for user: %s, token: %s", user.username, user.token);
			req.user = user;
			return res.status(200).json(req.user);
		});
	});
};

var fetch = function (headers) {
	if (headers && headers.authorization) {
		var authorization = headers.authorization;
		var part = authorization.split(' ');
		if (part.length === 2)
		{
			var token = part[1];
			return part[1];
		}
		else
		{
			return null;
		}
	}
	else
	{
		return null;
	}
};

var middleware = function () {
	var func = function (req, res, next) {
		var token = fetch(req.headers);
		jwt.verify(token, conf.jwt.secret, function (err, decode) {
			if (err) {
				req.user = undefined;
				return res.status(401).json('invalid token');
			}
			mod.readOne(decode._id, function(err, user){
				// we could add decode properties to the user object here
				req.user = user;
				next();
			});
		});
	};
	func.unless = require("express-unless");
	return func;
};

router.use(middleware().unless({path:'/signIn'}));

var jwtMiddleware = expressJwt({secret:conf.jwt.secret});
jwtMiddleware.unless = unless;
router.use( jwtMiddleware.unless({path: '/signIn'}) );

// error handler for all the applications
router.use(function (err, req, res, next) {
	var errorType = typeof err,
		code = 500,
		msg = { message: "Internal Server Error" };

	switch (err.name) {
		case "UnauthorizedError":
			code = err.status;
			msg = undefined;
			break;
		case "BadRequestError":
		case "UnauthorizedAccessError":
		case "NotFoundError":
			code = err.status;
			msg = err.inner;
			break;
		default:
			break;
	}
	console.log(err.name);
	return res.status(code).json(msg);
});

router.get("/verify", function (req, res) {
			var token = fetch(req.headers);
			jwt.verify(token, conf.jwt.secret, function (err, decode) {
				if (err) {
					req.user = undefined;
					return res.status(401).json('invalid token');
				}
				return res.status(200).json(req.user);
			});
});

router.route("/signIn").post(authenticate, function (req, res, next) {
	return res.status(200).json(req.user);
});

module.exports = router;
