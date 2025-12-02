const database = require("../../database");
const admin = require("firebase-admin");
const path = require("path");
require("dotenv").config();

// Update the path to the location where you saved your service account key file
const serviceAccountPath = path.resolve(
  __dirname,
  process.env.GOOGLE_APPLICATION_CREDENTIALS
);

class FCMService {
  constructor() {
    this._db = database.getConnection();
    if (!admin.apps.length) {
      const serviceAccount = require(serviceAccountPath);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
  }

  async addFCMToken(userId, token) {
    const query = `
      INSERT INTO fcm_tokens (user_id, fcm_token, updated_at) 
      VALUES (?, ?, NOW()) 
      ON DUPLICATE KEY UPDATE 
      fcm_token = VALUES(fcm_token), 
      updated_at = NOW()`;

    await this._db.execute(query, [userId, token]);
    console.log(`FCM token for user ${userId} added or updated.`);
  }

  async getFCMTokensByUserIds(userIds) {
    // Assuming you have a database connection available as this._db
    const query = `
      SELECT fcm_token 
      FROM fcm_tokens 
      WHERE user_id IN (${userIds.map(() => "?").join(",")})
    `;

    const [rows] = await this._db.execute(query, userIds);

    if (!rows || rows.length === 0) {
      // throw new Error("No FCM tokens found for the provided user IDs");
    }

    // Map over rows to extract just the FCM tokens
    const fcmTokens = rows.map((row) => row.fcm_token);
    return fcmTokens;
  }

  async sendNotification(userToNotifies, picUserId, notificationPayload) {
    // Ensure the result is always an array (even if a single user is returned)
    console.log(`userToNotifies: ${JSON.stringify(userToNotifies)}`);
    let userToNotify = userToNotifies;
    userToNotify = Array.isArray(userToNotify) ? userToNotify : [userToNotify];
    console.log(`usertonotify ${JSON.stringify(userToNotify)}`);
    // Add the picUserId to the list of users to notify, ensuring it's not duplicated
    if (userToNotify.includes(picUserId)) {
      userToNotify = [
        ...new Set(userToNotify.map((user) => user).concat([picUserId])),
      ];
    } else {
      userToNotify = [...userToNotify.map((user) => user), picUserId];
    }

    userToNotify = userToNotify.filter(
      (user) => user !== "" && user !== undefined
    );
    console.log(`usertonotify2 ${JSON.stringify(userToNotify)}`);
    const listToken = await this.getFCMTokensByUserIds(userToNotify);
    console.log(
      `listToken ${JSON.stringify(listToken)} and ${listToken.length}`
    );

    const message = {
      tokens: listToken,
      notification: notificationPayload,
    };

    console.log(`message ${JSON.stringify(message)}`);

    try {
      if (!message.tokens || message.tokens.length === 0) {
        console.warn("No tokens provided. Skipping push notification.");
        return {
          successCount: 0,
          failureCount: 0,
          responses: [],
        };
      }

      const response = await admin.messaging().sendEachForMulticast(message);

      console.log(`${response.successCount} messages were sent successfully`);
      console.log(`Failed tokens: ${JSON.stringify(response.failureCount)}`);

      response.responses.forEach((resp, index) => {
        if (!resp.success) {
          console.error(
            `Failed to send to token ${message.tokens[index]}: ${resp.error}`
          );
        }
      });

      return response;
    } catch (error) {
      console.error("Error sending message:", error);
      throw new Error("Failed to send notification");
    }
  }
}

module.exports = FCMService;
