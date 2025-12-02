const autoBind = require("auto-bind");
const NotFoundError = require("../../exceptions/NotFoundError");
const InvariantError = require("../../exceptions/InvariantError");

class ReportHandler {
  constructor(
    reportService,
    storageService,
    usersService,
    fcmService,
    emailService,
    validator
  ) {
    this._reportService = reportService;
    this._storageService = storageService;
    this._usersService = usersService;
    this._fcmService = fcmService;
    this._emailService = emailService;
    this._validator = validator;

    autoBind(this);
  }
  async postReportWithFileHandler(request, h) {
    try {
      const { evidancePhoto } = request.payload;
      this._validator.validateImageFile(evidancePhoto.hapi.headers);
      this._validator.validateReportPayload(request.payload);

      const { id: credentialId } = request.auth.credentials;
      const {
        finding,
        discoveryDate,
        cause,
        recomendation,
        targetDate,
        picUserId,
      } = request.payload;

      const user = await this._usersService.getUserById(credentialId);
      const userPIC = await this._usersService.getUserById(picUserId);

      const roleId = user[0].role_id;

      let userToNotify = [];
      let userToNotifyEmail = [];

      // Only call getUserToNotify if unit_id and division_id are not null
      if (user[0].unit_id || user[0].division_id) {
        userToNotify = await this._usersService.getUserToNotify(
          roleId,
          user[0].unit_id,
          user[0].division_id
        );
      }

      // Check if userToNotify is empty and roleId is 4, then notify unit leader instead
      if (userToNotify.length === 0 && roleId === 4) {
        if (user[0].unit_id) {
          userToNotify = await this._usersService.getUserToNotify(
            3,
            user[0].unit_id,
            user[0].division_id
          );
        }
      }

      console.log(
        `user Length Handler: ${userToNotify.length}, roleId: ${roleId}`
      );
      console.log(`userToNotify Handler: ${JSON.stringify(userToNotify)}`);
      // Only send notification if there are users to notify
      if (userToNotify.length > 0) {
        const notificationPayload = {
          title: `Ada Report Temuan ${finding}`,
          body: `Ada temuan laporan baru ${finding}. Segera cek temuan tersebut untuk persetujuan dari Anda.`,
        };
        await this._fcmService.sendNotification(
          userToNotify,
          picUserId,
          notificationPayload
        );

        userToNotifyEmail = await this._usersService.getUserEmailsByIds(
          userToNotify
        );

        console.log("userToNotifyEmailHandler: ", userToNotifyEmail);

        for (const user of userToNotifyEmail) {
          if (user) {
            try {
              console.log("Sending email to:", user);
              await this._emailService.sendEmail(
                user,
                `Ada Report Temuan "${finding}"`,
                `Hai ${user}, ada temuan baru: ${finding}. Silakan periksa temuan untuk ditindaklanjuti.`
              );
              console.log(`Email sent to ${user}`);
            } catch (error) {
              console.error(`Failed to send email to ${user}:`, error.message);
            }
          }
        }
      }

      const filename = await this._storageService.writeImageFile(
        evidancePhoto,
        evidancePhoto.hapi
      );

      let leaderUnit = [];
      let progress = 0;

      // Set the progress based on roleId and other conditions
      console.log(`roleIdCheck: ${roleId === 2}`);
      if (roleId === 1) {
        progress = 3;
      } else if (roleId === 2) {
        progress = 2;
      } else if (roleId === 3) {
        progress = 1;
      } else if (roleId === 4) {
        // Check if unit_id is not null before calling the function
        if (user[0].unit_id !== null) {
          leaderUnit = await this._usersService.getUserLeaderUnit(
            user[0].unit_id,
            3
          );
        }
        if (leaderUnit.length > 0) {
          progress = 0;
        } else {
          progress = 1;
        }
      }

      // Call the addReport method to insert the report into the database
      const reportId = await this._reportService.addReport(
        credentialId, // Assuming this is the ownerId
        user[0].fullname, // Assuming this is the owner's full name
        picUserId,
        userPIC[0].fullname,
        roleId,
        user[0].unit_id,
        user[0].division_id,
        finding,
        discoveryDate,
        cause,
        recomendation,
        targetDate,
        filename, // Pass the filename of the uploaded image
        progress
      );

      const response = h.response({
        status: "success",
        message: "Report berhasil diunggah",
      });
      response.code(201);
      return response;
    } catch (error) {
      console.error(error);
      const response = h.response({
        status: "fail",
        message: "Failed to upload report.",
      });
      response.code(500);
      return response;
    }
  }

  async getReportsByRoleHandler(request, h) {
    const userId = request.auth.credentials.id;

    const user = await this._usersService.getUserById(userId);
    const roleId = user[0].role_id;

    let unitId = null;
    let divisionId = null;

    // Assign unitId or divisionId based on the role
    if (roleId === 2) {
      // Division Leader
      divisionId = user[0].division_id;
    } else if (roleId === 3) {
      // Unit Leader
      unitId = user[0].unit_id;
    }

    // Call the service to get the reports based on role
    const data = await this._reportService.getReportsByRole(
      roleId,
      userId,
      unitId,
      divisionId
    );

    // Calculate the total number of reports
    const total = data.length; // Assuming 'data' is an array of report objects

    return h.response({
      status: "success",
      data: data,
      total: total, // Include the total count of reports in the response
    });
  }

  async updateReportHandler(request, h) {
    try {
      // Validate the incoming payload
      this._validator.validateUnitUpdatePayload(request.payload);

      const { id: reportId } = request.params; // Assuming 'id' is the reportId
      const { note } = request.payload;
      const { id: credentialId } = request.auth.credentials;
      let userToNotifyEmail = [];

      // Fetch user and report details
      const user = await this._usersService.getUserById(credentialId);
      const report = await this._reportService.getReportById(reportId);
      if (!report || report.length === 0) {
        return h
          .response({ status: "fail", message: "Report not found" })
          .code(404);
      }

      const roleId = user[0].role_id;
      const fullname = user[0].fullname;
      const picUserId = report[0].pic_user_id;
      const isPicUserId = picUserId === credentialId;
      const ownerId = user[0].id;
      const finding = report[0].finding; // Ensure this is spelled correctly

      // Get the appropriate unit or division id based on the role
      const unitId =
        roleId === 1 || roleId === 2 ? report[0].unit_id : user[0].unit_id;
      const divisionId =
        roleId === 1 ? report[0].division_id : user[0].division_id;

      // Fetch users to notify
      let userToNotify = await this._usersService.getUserToNotify(
        roleId,
        unitId,
        divisionId,
        isPicUserId,
        ownerId
      );

      console.log(`user Length: ${userToNotify.length}, roleId: ${roleId}`);
      console.log(`userToNotify: ${JSON.stringify(userToNotify)}`);

      const notificationPayload = {
        title: `Update ${fullname} : ${note} `,
        body: `Ada Update laporan ${finding}`,
      };

      // jika dia direktur maka notif ke PIC
      if (roleId === 1) {
        if (userToNotify.includes(picUserId)) {
          userToNotify = [
            ...new Set(userToNotify.map((user) => user).concat([picUserId])),
          ];
        } else {
          userToNotify = [...userToNotify.map((user) => user), picUserId];
        }
      }

      // Send notification
      await this._fcmService.sendNotification(
        userToNotify,
        picUserId,
        notificationPayload
      );

      userToNotifyEmail = await this._usersService.getUserEmailsByIds(
        userToNotify
      );

      console.log("userToNotifyEmailHandler: ", userToNotifyEmail);

      for (const user of userToNotifyEmail) {
        if (user) {
          try {
            console.log("Sending email to:", user);
            await this._emailService.sendEmail(
              user,
              `UPDATE Report Temuan "${finding}"`,
              `Hai ${user}, ada Update Temuan: ${finding}. Dengan Pesan "${note}" dari ${fullname}. Silakan periksa temuan untuk ditindaklanjuti.`
            );
            console.log(`Email sent to ${user}`);
          } catch (error) {
            console.error(`Failed to send email to ${user}:`, error.message);
          }
        }
      }

      // Update the report
      await this._reportService.updateReport(
        roleId,
        reportId,
        note,
        credentialId
      );

      // Return a success response
      return {
        status: "success",
        message: "Report successfully updated",
      };
    } catch (error) {
      console.error("Error in updateReportHandler:", error);
      return h
        .response({
          status: "fail",
          message: `Failed to update report: ${error.message}`,
        })
        .code(500);
    }
  }

  async updateReportProgressPICHandler(request, h) {
    // try {
    const { progressPhoto } = request.payload;
    this._validator.validateImageFile(progressPhoto.hapi.headers);
    this._validator.validateProgressReportPICPayload(request.payload);

    const { id: credentialId } = request.auth.credentials;
    const { id: reportId } = request.params;
    const { note } = request.payload;

    const filename = await this._storageService.writeImageFile(
      progressPhoto,
      progressPhoto.hapi
    );
    await this._reportService.updatePICProgressReport(
      credentialId, // Assuming this is the ownerId
      reportId, // Assuming this is the owner's full name
      note,
      filename
    );

    const response = h.response({
      status: "success",
      message: "Report PIC Progress berhasil diupdate",
    });
    response.code(200);
    return response;
    // } catch (error) {
    //   console.error(error);
    // }
  }

  async updateReportDonePICHandler(request, h) {
    // try {
    const { donePhoto } = request.payload;
    this._validator.validateImageFile(donePhoto.hapi.headers);
    this._validator.validateDoneReportPICPayload(request.payload);

    const { id: credentialId } = request.auth.credentials;
    const { id: reportId } = request.params;
    const { note } = request.payload;

    const filename = await this._storageService.writeImageFile(
      donePhoto,
      donePhoto.hapi
    );
    await this._reportService.updatePICDoneReport(
      credentialId, // Assuming this is the ownerId
      reportId, // Assuming this is the owner's full name
      note,
      filename
    );

    const response = h.response({
      status: "success",
      message: "Report PIC Done berhasil diupdate",
    });
    response.code(200);
    return response;
    // } catch (error) {
    //   console.error(error);
    // }
  }
}

module.exports = ReportHandler;
