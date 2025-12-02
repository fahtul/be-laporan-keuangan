const autoBind = require("auto-bind");

class AuthenticationHandler {
  constructor(
    authenticationsService,
    usersService,
    fcmService,
    tokenManager,
    validator
  ) {
    this._authenticationsService = authenticationsService;
    this._usersService = usersService;
    this._fcmService = fcmService;
    this._tokenManager = tokenManager;
    this._validator = validator;

    autoBind(this);
  }

  async postAuthenticationHandler(request, h) {
    // try {
    this._validator.validatePostAuthenticationPayload(request.payload);

    const { username, password, token } = request.payload;
    const { id, roleId, adminStatus, fullname, isChanged } =
      await this._usersService.verifyUserCredential(username, password, token);

    const accessToken = this._tokenManager.generateAccessToken({ id });
    const refreshToken = this._tokenManager.generateRefreshToken({ id });

    await this._authenticationsService.addRefreshToken(refreshToken);
    await this._fcmService.addFCMToken(id, token);

    const response = h.response({
      status: "success",
      message: "Authentication berhasil ditambahkan",
      data: {
        accessToken,
        refreshToken,
        roleId,
        adminStatus,
        username,
        fullname,
        isChanged,
      },
    });
    response.code(201);
    return response;
    // } catch (error) {
    // console.error(error);
    // }
  }

  async putAuthenticationHandler(request, h) {
    try {
      this._validator.validatePutAuthenticationPayload(request.payload);

      const { refreshToken } = request.payload;
      await this._authenticationsService.verifyRefreshToken(refreshToken);
      const { id } = this._tokenManager.verifyRefreshToken(refreshToken);

      const accessToken = this._tokenManager.generateAccessToken({ id });
      return {
        status: "success",
        message: "Access Token berhasil diperbarui",
        data: {
          accessToken,
        },
      };
    } catch (error) {
      console.error(error);
    }
  }

  async getAuthenticationHandler(request, h) {
    try {
      this._validator.validateGetAuthenticationPayload(request.payload);

      const { id: userId } = request.auth.credentials.id;
      const { is_changed_password: isChangedPassword } =
        this._usersService.getIsChangedPassword({ userId });
      return {
        status: "success",
        message: "Berhasil Mengambil data",
        data: {
          isChangedPassword,
        },
      };
    } catch (error) {
      console.error(error);
    }
  }

  async deleteAuthenticationHandler(request, h) {
    this._validator.validateDeleteAuthenticationPayload(request.payload);

    const { refreshToken } = request.payload;
    await this._authenticationsService.verifyRefreshToken(refreshToken);
    await this._authenticationsService.deleteRefreshToken(refreshToken);

    return {
      status: "success",
      message: "Refresh token berhasil dihapus",
    };
  }
}

module.exports = AuthenticationHandler;
