import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import { isStringObject } from "util/types";
import Session from "./Session";
import Logger from "./Logger";
const origins = { origin: ["http://localhost:5173"] };
const meetings = new Map();
const app = express();
app.use(cors(origins));
const PORT = process.env.PORT || 3000;
const httpServer = app.listen(PORT, () => {
  console.log("app running on " + PORT);
});
const logger = new Logger({ lable: "root" });
const sio = new Server(httpServer, { cors: origins });
sio.on("connection", async (socket) => {
  logger.log("New client connected: " + socket.id);

  logger.log(`Joined With MeetingId ${socket.handshake.headers.meetingid}`);
  if (
    !socket.handshake.headers.meetingid ||
    !isStringObject(socket.handshake.headers.meetingid)
  )
    socket.disconnect();
  if (meetings.has(socket.handshake.headers.meetingid)) {
    const metting = meetings.get(socket.handshake.headers.meetingid);
  } else {
    logger.log("creating a new meeting...");
    try {
      const meeting = new Session();
      await meeting.init();
      meetings.set(socket.handshake.headers.meetingid, meeting);
    } catch (err) {
      logger.error("Error creating meeting: " + err);
      socket.disconnect();
    }
  }
});
