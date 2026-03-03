import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import { isStringObject } from "util/types";
import Meeting from "./Meeting";
import Logger from "./Logger";
const origins = { origin: ["https://meet.jalajghuge.co.in"] };
const meetings = new Map<string, Meeting>();

const app = express();
app.use(cors(origins));
const PORT = process.env.PORT || 3000;
const httpServer = app.listen(PORT, () => {
  console.log("app running on " + PORT);
});
const logger = new Logger({ lable: "root" });
const io = new Server(httpServer, { cors: origins, path: "/ws/meet" });
const sio = io.of("/api/meet");
sio.on("connection", async (socket) => {
  const socketId = socket.id;
  logger.log("New client connected: " + socketId);
  const meetingId: string = String(socket.handshake.headers.meetingid);
  logger.log(`Joined With MeetingId ${meetingId}`);
  if (!meetingId) {
    socket.disconnect();
    return;
  }
  socket.join(meetingId);
  let meeting: Meeting;
  if (meetings.has(meetingId)) {
    try {
      logger.log("Joining existing meeting...");
      meeting = meetings.get(meetingId)!;
    } catch (err) {
      logger.error("Error joining meeting: " + err);
      socket.disconnect();
    }
  } else {
    logger.log("creating a new meeting...");
    try {
      meeting = new Meeting({ admin: socket });
      await meeting.init();
      meetings.set(meetingId, meeting);
    } catch (err) {
      console.log(err);
      logger.error("Error creating meeting: " + err);
      socket.disconnect();
    }
  }

  socket.on("join", async () => {
    meeting.joinUser(socket);
  });
  socket.on("getTransports", async (callback) => {
    const params = await meeting.getTransports(socket);
    callback(params);
  });

  socket.on("connectSendTransport", async ({ dtlsParameters }, callback) => {
    console.log(dtlsParameters);
    console.log(callback);
    await meeting.connectSendTransport(socket, dtlsParameters);
    callback();
  });

  socket.on("connectRecvTransport", async ({ dtlsParameters }, callback) => {
    console.log(dtlsParameters);
    console.log(callback);
    await meeting.connectRecvTransport(socket, dtlsParameters);
    callback();
  });
  socket.on("produce", async ({ kind, rtpParameters }, callback) => {
    const producerId = await meeting.produce(socket, kind, rtpParameters);
    // sio.to(meetingId).emit("newUser", { producerId, kind });
    socket.to(meetingId).emit("newUser", { producerId, kind });
    callback(producerId);
  });
  socket.on("disconnect", () => {
    logger.log("Client disconnected: " + socketId);
    const producers = meeting.cleanUserData(socket.id);
    sio.to(meetingId).emit("producersClosed", producers);
  });

  socket.on(
    "consume",
    async ({ producerId, rtpCapabilities, kind }, callback) => {
      const data = await meeting.consume(socket, producerId, rtpCapabilities);

      callback({ ...data, kind });
    }
  );
});
