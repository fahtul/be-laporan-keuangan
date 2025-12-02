const AuthenticationHandler = require('./handler');
const routes = require('./routes');

module.exports = {
    name: 'authentications',
    version: '1.0.0',
    register: async (server, {
        authenticationsService,
        usersService,
        fcmService,
        tokenManager,
        validator,
    }) => {
        const authenticationHandler = new AuthenticationHandler(
            authenticationsService,
            usersService,
            fcmService,
            tokenManager,
            validator,
        );

        server.route(routes(authenticationHandler));
    },
};