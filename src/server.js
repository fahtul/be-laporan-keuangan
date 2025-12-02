const Hapi = require("@hapi/hapi");
const Jwt = require("@hapi/jwt");
const Inert = require("@hapi/inert");
const path = require("path");
const fs = require("fs");
const { logError } = require("./utils/logger");

const ClientError = require("./exceptions/ClientError");
require("dotenv").config();

// Divisions
const divisions = require("./api/divisions");
const DivisionsService = require("./services/mssql/DivisionsService");
const DivisionsValidator = require("./validator/divisions");

// Activities
const activities = require("./api/activity");
const ActivitiesService = require("./services/mssql/ActivityService");
const ActivitiesValidator = require("./validator/activity");

// Absent
const absents = require("./api/absent");
const AbsentService = require("./services/mssql/AbsentService");
const AbsentValidator = require("./validator/absent");

// Units
const units = require("./api/units");
const UnitsService = require("./services/mssql/UnitsService");
const UnitsValidator = require("./validator/units");

// Users
const users = require("./api/users");
const UsersService = require("./services/mssql/UsersService");
const UsersValidator = require("./validator/users");

// Jobdesk
const jobdesks = require("./api/jobdesk");
const JobdeskService = require("./services/mssql/JobdeskService");
const JobdeskValidator = require("./validator/jobdesks");

// Document
const documents = require("./api/documents");
const DocumentService = require("./services/mssql/DocumentService");
const DocumentValidator = require("./validator/documents");

// Jaspel
const jaspels = require("./api/jaspels");
const JaspelService = require("./services/mssql/JaspelService");
const JaspelValidator = require("./validator/jaspels");

// Report
const reports = require("./api/report");
const ReportService = require("./services/mssql/ReportService");
const FcmService = require("./services/mssql/FCMService");
const ReportValidator = require("./validator/report");

// Nilai
const nilais = require("./api/nilais");
const NilaiService = require("./services/mssql/NilaiService");
const NilaiValidator = require("./validator/nilais");

// KPI
const kpis = require("./api/kpis");
const KpiService = require("./services/mssql/KpiService");
const KpiValidator = require("./validator/kpis");

// Jobdesk Collaboration
const jobdesksCollaboration = require("./api/jobdesk_collaboration");
const JobdeskCollaborationService = require("./services/mssql/JobdeskCollaborationService");
const JobdeskCollaborationValidator = require("./validator/jobdesk_collaborations");

// Document Collaboration
const documentsCollaboration = require("./api/document_collaboration");
const DocumentCollaborationService = require("./services/mssql/DocumentCollaborationService");
const DocumentCollaborationValidator = require("./validator/document_collaborations");

// Jaspel Collaboration
const jaspelsCollaboration = require("./api/jaspel_collaboration");
const JaspelCollaborationService = require("./services/mssql/JaspelCollaborationService");
const JaspelCollaborationValidator = require("./validator/jaspel_collaborations");

// Nilai Collaboration
const nilaisCollaboration = require("./api/nilai_collaboration");
const NilaiCollaborationService = require("./services/mssql/NilaiCollaborationService");
const NilaiCollaborationValidator = require("./validator/nilai_collaborations");

// KPI Collaboration
const kpisCollaboration = require("./api/kpi_collaboration");
const KpiCollaborationService = require("./services/mssql/KpiCollaborationService");
const KpiCollaborationValidator = require("./validator/kpi_collaborations");

const addReports = require("./api/add_report");
const AddReportService = require("./services/mssql/AddReportService");
const AddReportValidator = require("./validator/inputreports");

// Storage
const { StorageService } = require("./services/storage/StorageService");

// Authentication
const authentications = require("./api/authentications");
const AuthenticationsService = require("./services/mssql/AuthenticationsService");
const AuthenticationValidator = require("./validator/authentications");
const TokenManager = require("./tokenize/TokenManager");
const EmailService = require("./services/mssql/EmailService");

const attendance = require("./api/attendance");
const workSchedulesPlugin = require("./api/workSchedules");

const newWorkSchedulesPlugin = require("./api/newWorkSchedules");

const salaryRulesPlugin = require("./api/salaryRules");
const leavesRequestsPlugin = require("./api/leaves");

const WorkScheduleValidator = require("./validator/newWorkSchedules");

// Import services and validators
const FaceService = require("./services/FaceService");
const FaceValidator = require("./validator/face");

// Import the plugin
const FacePlugin = require("./api/face");

const RequestsService = require("./services/mssql/RequestsService");
const WorkScheduleService = require("./services/mssql/NewWorkScheduleService");
const RequestsValidator = require("./validator/requests");
const Requests = require("./api/requests");
const PayrollComponentsService = require("./services/mssql/PayrollComponentService");

const salary = require("./api/salary");
const SalaryService = require("./services/mssql/SalaryService");
const SalaryValidator = require("./validator/salary");
const AttendanceSusulanService = require("./services/mssql/AttendanceSusulanService");
const attendanceSusulan = require("./api/attendanceSusulan");
const AttendanceSusulanValidator = require("./validator/attendanceSusulan");
const attendance_report = require("./api/attendance_report");
const AttendanceReportService = require("./services/mssql/AttendanceReportService");
const payroll2 = require("./api/payroll2");

const presence = require("./api/presence");
const PresenceSummaryService = require("./services/mssql/PresenceSummaryService");
const PresenceValidator = require("./api/presence/validator");

const presenceService = new PresenceSummaryService();
const presenceValidator = new PresenceValidator();

const lateSummary = require("./api/late");
const LateSummaryService = require("./services/mssql/LateSummaryService");
const LateValidator = require("./api/late/validator");

const lateService = new LateSummaryService();
const lateValidator = new LateValidator();

// Misalnya root proyek adalah 2 level di atas file ini:
const uploadFolder = path.resolve(__dirname, "../requests");

const init = async () => {
  const divisionsService = new DivisionsService();
  const activitiesService = new ActivitiesService();
  const absentService = new AbsentService();
  const unitsService = new UnitsService();
  const usersService = new UsersService();
  const fcmService = new FcmService();
  const emailService = new EmailService();

  const authenticationsService = new AuthenticationsService();
  const jobdeskService = new JobdeskService();
  const documentService = new DocumentService();
  const jaspelService = new JaspelService();
  const nilaiService = new NilaiService();
  const kpiService = new KpiService();

  const jobdeskCollaborationService = new JobdeskCollaborationService();
  const documentCollaborationService = new DocumentCollaborationService();
  const jaspelCollaborationService = new JaspelCollaborationService();
  const nilaiCollaborationService = new NilaiCollaborationService();
  const kpiCollaborationService = new KpiCollaborationService();
  const addReportService = new AddReportService();
  const reportService = new ReportService();
  const attendaceSusulanService = new AttendanceSusulanService();
  const attendanceReportService = new AttendanceReportService();

  const payrollPlugin = require("./api/payroll");
  const PayrollService = require("./services/mssql/PayrollService");
  const salaryService = new SalaryService();

  // at the top with your other requires
  const overtime = require("./api/overtime_summary");
  const OvertimeService = require("./services/mssql/OvertimeService");
  const OvertimeValidator = require("./api/overtime_summary/validator");

  // instantiate services/validators (similar to your other modules)
  const overtimeService = new OvertimeService();
  const overtimeValidator = new OvertimeValidator();

  const jobdeskStorageService = new StorageService(
    path.resolve(__dirname, process.env.JOBDESK_STORAGE_PATH)
  );

  const documentStorageService = new StorageService(
    path.resolve(__dirname, process.env.DOCUMENT_STORAGE_PATH)
  );

  const jaspelStorageService = new StorageService(
    path.resolve(__dirname, process.env.JASPEL_STORAGE_PATH)
  );

  const nilaiStorageService = new StorageService(
    path.resolve(__dirname, process.env.NILAI_STORAGE_PATH)
  );

  const kpiStorageService = new StorageService(
    path.resolve(__dirname, process.env.KPI_STORAGE_PATH)
  );

  const reportStorageService = new StorageService(
    path.resolve(__dirname, process.env.REPORT_STORAGE_PATH)
  );

  const addReportStorageService = new StorageService(
    path.resolve(__dirname, process.env.ADD_REPORT_STORAGE_PATH)
  );

  const PayrollComponents = require("./api/payrollComponents");

  const UserComponentValues = require("./api/userComponentValues");
  const UserComponentValuesService = require("./services/mssql/UserComponentValuesService");
  const UserComponentValuesValidator = require("./validator/userComponentValues");

  const AnnualLeaveService = require("./services/mssql/AnnualLeaveService");
  const annualLeaveService = new AnnualLeaveService();
  const cron = require("node-cron");

  const server = Hapi.server({
    port: process.env.PORT,
    host: process.env.HOST,
  });

  await server.register([
    {
      plugin: Jwt,
    },
    {
      plugin: Inert,
    },
  ]);

  // ─── Static file serving for attendance selfies ─────────────────────────────
  server.route({
    method: "GET",
    path: "/uploads/attendance/{param*}",
    handler: {
      directory: {
        path: path.resolve(__dirname, "uploads", "attendance"),
        redirectToSlash: false,
        index: false,
      },
    },
    options: {
      auth: false, // or `auth: 'jims_jwt'` if you want it protected
      tags: ["api"],
      description: "Serve attendance selfie images",
    },
  });

  server.auth.strategy("jims_jwt", "jwt", {
    keys: process.env.ACCESS_TOKEN_KEY,
    verify: {
      aud: false,
      iss: false,
      sub: false,
      maxAgeSec: process.env.ACCESS_TOKEN_AGE,
    },
    validate: (artifacts) => ({
      isValid: true,
      credentials: {
        id: artifacts.decoded.payload.id,
      },
    }),
  });

  try {
    await server.register([
      {
        plugin: authentications,
        options: {
          authenticationsService,
          usersService,
          fcmService,
          tokenManager: TokenManager,
          validator: AuthenticationValidator,
        },
      },
      {
        plugin: divisions,
        options: {
          service: divisionsService,
          usersService: usersService,
          validator: DivisionsValidator,
        },
      },
      {
        plugin: activities,
        options: {
          service: activitiesService,
          usersService: usersService,
          validator: ActivitiesValidator,
        },
      },
      {
        plugin: absents,
        options: {
          service: absentService,
          usersService: usersService,
          validator: AbsentValidator,
        },
      },
      {
        plugin: overtime,
        options: {
          overtimeService,
          validator: overtimeValidator, // you can also pass the class: OvertimeValidator
        },
      },
      {
        plugin: units,
        options: {
          service: unitsService,
          usersService: usersService,
          validator: UnitsValidator,
        },
      },
      {
        plugin: users,
        options: {
          service: usersService,
          unitsService: unitsService,
          validator: UsersValidator,
        },
      },
      {
        plugin: jobdesks,
        options: {
          jobdeskService: jobdeskService,
          storageService: jobdeskStorageService,
          unitService: unitsService,
          divisionService: divisionsService,
          usersService: usersService,
          jobdeskCollaborationService: jobdeskCollaborationService,
          validator: JobdeskValidator,
        },
      },
      {
        plugin: jobdesksCollaboration,
        options: {
          jobdeskService: jobdeskService,
          jobdeskCollaborationService: jobdeskCollaborationService,
          userService: usersService,
          divisionService: divisionsService,
          unitService: unitsService,
          validator: JobdeskCollaborationValidator,
        },
      },
      {
        plugin: documents,
        options: {
          documentService: documentService,
          storageService: documentStorageService,
          unitService: unitsService,
          divisionService: divisionsService,
          usersService: usersService,
          documentCollaborationService: documentCollaborationService,
          validator: DocumentValidator,
        },
      },
      {
        plugin: documentsCollaboration,
        options: {
          documentService: documentService,
          documentCollaborationService: documentCollaborationService,
          userService: usersService,
          divisionService: divisionsService,
          unitService: unitsService,
          validator: DocumentCollaborationValidator,
        },
      },
      {
        plugin: jaspels,
        options: {
          jaspelService: jaspelService,
          storageService: jaspelStorageService,
          unitService: unitsService,
          divisionService: divisionsService,
          usersService: usersService,
          jaspelCollaborationService: jaspelCollaborationService,
          validator: JaspelValidator,
        },
      },
      {
        plugin: reports,
        options: {
          reportService: reportService,
          storageService: reportStorageService,
          usersService: usersService,
          fcmService: fcmService,
          emailService: emailService,
          validator: ReportValidator,
        },
      },
      {
        plugin: jaspelsCollaboration,
        options: {
          jaspelService: jaspelService,
          jaspelCollaborationService: jaspelCollaborationService,
          userService: usersService,
          divisionService: divisionsService,
          unitService: unitsService,
          validator: JaspelCollaborationValidator,
        },
      },
      {
        plugin: nilais,
        options: {
          nilaiService: nilaiService,
          storageService: nilaiStorageService,
          unitService: unitsService,
          divisionService: divisionsService,
          usersService: usersService,
          nilaiCollaborationService: nilaiCollaborationService,
          validator: NilaiValidator,
        },
      },
      {
        plugin: nilaisCollaboration,
        options: {
          nilaiService: nilaiService,
          nilaiCollaborationService: nilaiCollaborationService,
          userService: usersService,
          divisionService: divisionsService,
          unitService: unitsService,
          validator: NilaiCollaborationValidator,
        },
      },
      {
        plugin: kpis,
        options: {
          kpiService: kpiService,
          storageService: kpiStorageService,
          unitService: unitsService,
          divisionService: divisionsService,
          usersService: usersService,
          kpiCollaborationService: kpiCollaborationService,
          validator: KpiValidator,
        },
      },
      {
        plugin: kpisCollaboration,
        options: {
          kpiService: kpiService,
          kpiCollaborationService: kpiCollaborationService,
          userService: usersService,
          divisionService: divisionsService,
          unitService: unitsService,
          validator: KpiCollaborationValidator,
        },
      },
      {
        plugin: addReports,
        options: {
          addReportService: addReportService,
          storageService: addReportStorageService,
          usersService: usersService,
          validator: AddReportValidator,
        },
      },
      {
        plugin: FacePlugin,
        options: {
          service: new FaceService(),
          validator: FaceValidator,
        },
      },
      {
        plugin: attendance,
      },
      {
        plugin: workSchedulesPlugin,
      },
      {
        plugin: salaryRulesPlugin,
      },

      {
        plugin: payrollPlugin,
        options: {
          service: new PayrollService(),
        },
      },
      {
        plugin: leavesRequestsPlugin,
      },
      {
        plugin: newWorkSchedulesPlugin,
        options: {
          validator: WorkScheduleValidator,
        },
      },
      {
        plugin: Requests,
        options: {
          service: new RequestsService(),
          usersService: new UsersService(),
          validator: RequestsValidator,
          storageService: new StorageService(uploadFolder),
          fcmService: new FcmService(),
          emailService: new EmailService(),
          newWorkScheduleService: new WorkScheduleService(),
        },
      },
      {
        plugin: PayrollComponents,
        options: {
          service: new PayrollComponentsService(),
          validator: require("./validator/payrollComponents"),
        },
      },
      {
        plugin: UserComponentValues,
        options: {
          service: new UserComponentValuesService(),
          validator: UserComponentValuesValidator,
        },
      },
      {
        plugin: salary,
        options: {
          service: salaryService,
          validator: SalaryValidator,
        },
      },
      {
        plugin: attendanceSusulan,
        options: {
          service: attendaceSusulanService,
          usersService: usersService,
          validator: AttendanceSusulanValidator,
        },
      },
      {
        plugin: attendance_report,
        options: {
          service: attendanceReportService,
          // usersService: usersService,
          // validator: AttendanceSusulanValidator,
        },
      },

      {
        plugin: payroll2,
        // options: {
        //   service: attendanceReportService,
        //   // usersService: usersService,
        //   // validator: AttendanceSusulanValidator,
        // },
      },

      {
        plugin: presence,
        options: { service: presenceService, validator: presenceValidator },
      },
      {
        plugin: lateSummary,
        options: { service: lateService, validator: lateValidator },
      },
    ]);

    console.log("✅ Semua plugin berhasil diregister");
  } catch (err) {
    console.error("❌ Error saat register plugin:", err);
    logError("❌ Gagal saat register plugin", err);
  }

  // server.ext("onPreResponse", (request, h) => {
  //   const { response } = request;

  //   if (response instanceof Error && !(response instanceof ClientError)) {
  //     logError("❗ Internal Server Error", response);
  //   }

  //   if (response instanceof ClientError) {
  //     const newResponse = h.response({
  //       status: "fail",
  //       message: response.message,
  //     });
  //     newResponse.code(response.statusCode);
  //     return newResponse;
  //   }

  //   return h.continue;
  // });

  server.ext("onPreResponse", (request, h) => {
    const { response } = request;

    // Log untuk error internal server
    if (response instanceof Error && !(response instanceof ClientError)) {
      const statusCode = response.output?.statusCode || 500;
      const message = response.message || "Internal Server Error";

      logError(
        `❗ ${request.method.toUpperCase()} ${
          request.path
        } - Internal Server Error`,
        response
      );

      return h
        .response({
          status: "error",
          message,
        })
        .code(statusCode);
    }

    // Log untuk error dari Client (validasi, dll)
    if (response instanceof ClientError) {
      logError(
        `⚠️ ${request.method.toUpperCase()} ${request.path} - Client Error`,
        response
      );

      return h
        .response({
          status: "fail",
          message: response.message,
        })
        .code(response.statusCode);
    }

    return h.continue;
  });

  server.route({
    method: "GET",
    path: "/test",
    handler: (request, h) => {
      return h
        .response({
          status: "success",
          message: "Test route is working!",
        })
        .code(200);
    },
    options: {
      auth: false,
    },
  });

  // Every day at 00:05
  // cron.schedule("5 0 * * *", async () => {
  //   const today = new Date();
  //   const year = today.getFullYear();
  //   try {
  //     await annualLeaveService.generateDailyBalances(year);
  //     console.log(`✅ Annual leave balances ensured for ${year}`);
  //   } catch (err) {
  //     console.error("❌ generateDailyBalances error:", err);
  //   }
  // });

  await server.start();
  logError("✅ Server berhasil dijalankan pada " + server.info.uri);

  console.log(`Server running at: ${server.info.uri}`);
};

init();
