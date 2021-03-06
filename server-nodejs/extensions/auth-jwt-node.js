/*
 * auth-jwt-node.js
 */

module.exports = function (app) {
    var db  = app.locals.db;
    var conf = app.locals.conf.jwt;

    var expressJwt = require('express-jwt');
    var jwt = require('jsonwebtoken');
    var unless = require('express-unless');
    var crypto = require('crypto');
    var debug = require('debug')('app:auth:' + process.pid);
    var cookieParser = require('cookie-parser')
    debug("Authentification is JWT");

    var middleware = function () {
        var func = function (req, res, next) {
            var token = fetch(req.headers) || req.cookies.token;
            if (token === null && conf.required === false) {
                req.user = {};
                next();
                return;
            }
            jwt.verify(token, conf.secret, function (err, decode) {
                if (err) {
                    if (conf.required === false ) {
                        req.user = {};
                        next();
                        return;
                    }
                    req.user = undefined;
                    return res.status(401).json('401 Unauthorized (invalid token and authentication is required)');
                }
                db.read([decode._id], function (err, user) {
                    // we could add decode properties to the user object here
                    req.user = user[0];
                    next();
                });
            });
        };
        func.unless = require('express-unless');
        return func;
    };

    var authenticate = function (req, res, next) {
        debug('Processing authenticate middleware');
        if (!req.body.username || !req.body.password) {
            debug('no username or password');
            return res.status(401).json('Invalid username or password');
        }
        db.search({'username': req.body.username}, function (err, doc) {
            if (err || doc.length === 0) {
                return res.status(401).json('Invalid username or password');
            }
            db.read([doc[0]], function (err, user) {
                user = user[0];
                if (crypto.createHash(conf.passwordHashAlgorithm).update(req.body.password).digest('hex') !== user.password) {
                    return res.status(401).json('Invalid username or password');
                }
                debug('User authenticated, generating token');
                user.lastlogin = Date.now();
                db.update([user], function(err, nodes){
                    user.token = jwt.sign({ _id: user._id, username: user.username }, conf.secret, { expiresIn: conf.exp*60 });
                    var decoded = jwt.decode(user.token);
                    user.token_exp = decoded.exp;
                    user.token_iat = decoded.iat;
                    delete user.password;
                    debug('Token generated for user: %s, token: %s', user.username, user.token);
                    req.user = user;
                    req.user.address = req.connection.remoteAddress;
                    req.user.class = req.user.class || 'guest';
                    return res.status(200).json(req.user);
                });
            });
        });
    };

    var fetch = function (headers) {
        if (headers && headers.authorization) {
            var authorization = headers.authorization;
            var part = authorization.split(' ');
            if (part.length === 2) {
                var token = part[1];
                if ('null' === token) {
                    token = null;
                }
                return token;
            } else {
                return null;
            }
        } else {
            return null;
        }
    };

    var verify = function (req, res, next) {
        return res.status(200).json(req.user);
    }

    app.use(cookieParser());
    app.use(conf.expressUse, middleware().unless(conf.expressUnless));
    app.get('/api/verify', verify );
    app.route('/api/signIn').post(authenticate, function (req, res, next) {
        res.status(200).json(req.user);
    });

}


