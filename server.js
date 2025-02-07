import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import quizRoutes from "./routes/quizRoutes.js";
import clerkRoutes from "./routes/clerkRoute.js";
import bodyParser from "body-parser";
import { createServer } from "http";
import { Server } from "socket.io";
import OnlineHandShakeRoomModel from "./models/OnlineHandShakeRoom.js";
import subjectModel from "./models/Subject.js";
import OnlineRoomModel from "./models/OnlineRoom.js";
import UserModel from "./models/User.js";
import yearModel from "./models/Year.js";
import topicModel from "./models/Topic.js";
import OnlineHistoryModel from "./models/OnlineHistory.js";

const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

io.on("connection", (socket) => {
  const createRoom = async (data) => {
    const {
      subjectId,
      yearIdOrTopicId,
      quizLimit,
      quizType,
      userId,
      sessionId,
      name,
      imageUrl,
      seconds,
    } = data;

    if (
      !subjectId ||
      !yearIdOrTopicId ||
      !quizLimit ||
      !quizType ||
      !sessionId ||
      !userId ||
      !name ||
      !imageUrl ||
      !seconds
    ) {
      socket.emit("payload-error", { error: "Payload is incorrect" });
      return;
    }
    try {
      // Create handshake room
      const newHandShakeRoom = new OnlineHandShakeRoomModel({
        subjectId,
        sessionId,
        quizLimit,
        quizType,
        isAlive: true,
        user: userId,
        [quizType === "Yearly" ? "yearId" : "topicId"]: yearIdOrTopicId,
      });
      await newHandShakeRoom.save();

      let findSameStudent;
      let retryCount = 0;
      const maxRetries = 20;
      let timeoutId;

      const searchStudent = async () => {
        if (retryCount >= maxRetries) return null;
        // Find matching handshake room
        const query = {
          subjectId,
          [quizType === "Yearly" ? "yearId" : "topicId"]: yearIdOrTopicId,
          sessionId: { $ne: sessionId },
          isAlive: true,
        };
        console.log("Find matching student query");
        findSameStudent = await OnlineHandShakeRoomModel.findOne(query);
        if (findSameStudent) {
          console.log("Finded same student");
          return await handleOnlineRoom();
        } else {
          retryCount++;
          return new Promise((resolve) => {
            timeoutId = setTimeout(() => resolve(searchStudent()), 500);
          });
        }
      };

      const handleOnlineRoom = async () => {
        // Generate unique room key
        const uniqueKey = [userId, findSameStudent.user].sort().join("_");

        // Fetch quiz data
        const model = quizType === "Yearly" ? yearModel : topicModel;
        const { mcqs } = await model.findById(yearIdOrTopicId).select("mcqs");

        // Generate random quiz IDs
        const targetQuiz = [];
        while (targetQuiz.length < quizLimit) {
          const randomIndex = Math.floor(Math.random() * mcqs.length);
          const quizId = mcqs[randomIndex];
          if (!targetQuiz.includes(quizId)) targetQuiz.push(quizId);
        }

        // Atomic room creation/update
        const filter = { uniqueKey, isEnded: false };
        const update = {
          $setOnInsert: {
            subjectId,
            quizType,
            isUser1Alive: true,
            isUser2Alive: true,
            quizes: targetQuiz,
            seconds,
            user1: userId,
            user1SessionId: sessionId,
            user2: findSameStudent.user,
            user2SessionId: findSameStudent.sessionId,
            [quizType === "Yearly" ? "yearId" : "topicId"]: yearIdOrTopicId,
          },
        };
        const options = { upsert: true, new: true, setDefaultsOnInsert: true };

        const onlineRoom = await OnlineRoomModel.findOneAndUpdate(
          filter,
          update,
          options
        );
        // Update session ID if needed
        if (onlineRoom.user1 === userId) {
          onlineRoom.user1SessionId = sessionId;
        } else if (onlineRoom.user2 === userId) {
          onlineRoom.user2SessionId = sessionId;
        }
        await onlineRoom.save();

        return {
          newOnlineRoomId: onlineRoom._id,
          user1Id: onlineRoom.user1,
          user2Id: onlineRoom.user2,
        };
      };

      // Execute search and handle results
      const result = await searchStudent();
      clearTimeout(timeoutId);

      if (result) {
        const { newOnlineRoomId, user1Id, user2Id } = result;
        const isUser1 = user1Id === userId;
        const opponentId = isUser1 ? user2Id : user1Id;

        const opponentUser = await UserModel.findOne(
          { clerkId: opponentId },
          "fullName imageUrl"
        );

        // Verify room readiness
        let roomValid = false;
        for (let i = 0; i < 10; i++) {
          const room = await OnlineRoomModel.findById(newOnlineRoomId);
          if (room.user1 && room.user2) {
            roomValid = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        if (roomValid) {
          socket.emit("student-find", {
            roomId: newOnlineRoomId,
            opponent: opponentUser,
          });
        } else {
          socket.emit("no-student-found", { error: "Failed to find student" });
        }

        // // Cleanup handshake rooms
        await OnlineHandShakeRoomModel.findOneAndUpdate(
          { _id: findSameStudent._id },
          { isAlive: false }
        );
      } else {
        await OnlineHandShakeRoomModel.findByIdAndUpdate(newHandShakeRoom._id, {
          isAlive: false,
        });
        socket.emit("no-student-found", { error: "Failed to find student" });
      }
    } catch (error) {
      console.error("Room creation error:", error);
      socket.emit("error", { error: "Internal server error" });
    }
  };
  const submitOnlineRoom = async (data) => {
    const { roomId, userId, selectedStates, mcqs, completeTime } = data;
    if (roomId && userId && selectedStates && mcqs && completeTime) {
      const newOnlineHistory = await OnlineHistoryModel.create({
        roomId,
        mcqs,
        user: userId,
        roomType: "online-room",
        quizIdAndValue: selectedStates,
        time: completeTime,
      });
      const findOnlineRoom = await OnlineRoomModel.findById(roomId);
      if (findOnlineRoom.resignation) {
        if (findOnlineRoom.user1 === userId) {
          io.to(findOnlineRoom.user2SessionId).emit("opponent-resign", {
            isCompleted: true,
            time: completeTime,
          });
        } else if (findOnlineRoom.user2 === userId) {
          io.to(findOnlineRoom.user1SessionId).emit("opponent-resign", {
            isCompleted: true,
            time: completeTime,
          });
        }
        return;
      } else {
        if (findOnlineRoom.user1 === userId) {
          await OnlineRoomModel.findOneAndUpdate(
            { _id: roomId },
            { isUser1Alive: false }
          );
          io.to(findOnlineRoom.user2SessionId).emit("opponent-completed", {
            isCompleted: true,
            time: completeTime,
          });
          socket.emit("complete-response", { _id: newOnlineHistory._id });
        } else if (findOnlineRoom.user2 === userId) {
          await OnlineRoomModel.findOneAndUpdate(
            { _id: roomId },
            { isUser2Alive: false }
          );
          io.to(findOnlineRoom.user1SessionId).emit("opponent-completed", {
            isCompleted: true,
            time: completeTime,
          });
          socket.emit("complete-response", { _id: newOnlineHistory._id });
        }
      }
    } else {
      socket.emit("submit-error", { error: "payload-not-correct" });
    }
  };
  const getOnlineHistory = async (data) => {
    let timeoutId;
    const { resultId, roomId } = data;
    if (resultId && roomId) {
      const getOpponentHistory = async () => {
        const findOpponentHistory = await OnlineHistoryModel.findOne({
          roomId,
          _id: { $ne: resultId },
        })
          .populate({ path: "mcqs" })
          .populate({
            path: "roomId",
            select: "_id subjectId yearId topicId quizType",
            populate: {
              path: "subjectId yearId topicId",
              select: "subject year topic",
            },
          });
        if (findOpponentHistory) {
          return findOpponentHistory;
        } else {
          return new Promise((resolve) => {
            timeoutId = setTimeout(() => resolve(getOpponentHistory()), 1000);
          });
        }
      };
      clearTimeout(timeoutId);
      const getOnlineHistoryRes = await getOpponentHistory();

      if (getOnlineHistoryRes) {
        socket.emit("get-online-history-data", getOnlineHistoryRes);
      } else {
        socket.emit("get-online-history-error", { error: "not-found" });
      }
    } else {
      socket.emit("get-online-history-error", { error: "payload-error" });
    }
  };
  const onlineResignSubmit = async (data) => {
    const { roomId, userId, selectedStates, mcqs, completeTime } = data;
    if (roomId && userId && selectedStates && mcqs && completeTime) {
      const newOnlineHistory = await OnlineHistoryModel.create({
        roomId,
        mcqs,
        user: userId,
        roomType: "online-room",
        quizIdAndValue: selectedStates,
        time: completeTime,
      });
      socket.emit("complete-resign-response", { _id: newOnlineHistory._id });
    } else {
      console.log("This payload is not correct");
    }
  };
  socket.on("create-online-room", createRoom);
  socket.on("online-submit", submitOnlineRoom);
  socket.on("get-online-history", getOnlineHistory);
  socket.on("online-resign-submit", onlineResignSubmit);
  socket.on("testing", (data) => {
    console.log(data);
  });

  socket.on("disconnect", async () => {
    // User leave the quiz means we need to call resign
    const findOnlineRoom = await OnlineRoomModel.findOne({
      $or: [
        {
          user1SessionId: socket.id,
        },
        {
          user2SessionId: socket.id,
        },
      ],
      isEnded: false,
    });

    // if (findOnlineRoom.user1SessionId === socket.id) {
    //   await OnlineRoomModel.findOneAndUpdate(findOnlineRoom._id, {
    //     isUser1Alive: false,
    //     isUser2Alive: false,
    //     resignation: findOnlineRoom.user1,
    //   });
    // } else if (findOnlineRoom.user2SessionId === socket.id) {
    //   await OnlineRoomModel.findOneAndUpdate(findOnlineRoom._id, {
    //     isUser1Alive: false,
    //     isUser2Alive: false,
    //     resignation: findOnlineRoom.user2,
    //   });
    // }

    // Remove event listeners when the socket disconnects
    socket.off("create-online-room", createRoom);
    socket.off("online-submit", submitOnlineRoom);
    socket.off("get-online-history", getOnlineHistory);
    socket.off("online-resign-submit", onlineResignSubmit);
  });
});

app.use(express.json());
app.use((req, res, next) => {
  req.io = io;
  next();
});
app.use(bodyParser.json());
app.use(
  cors({
    origin: "*",
    methods: ["POST", "OPTIONS"], // Explicitly allow needed methods
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Content-Length"],
    maxAge: 86400,
  })
);
app.use("/api/quiz", quizRoutes);
app.use("/api/clerk/webhook", clerkRoutes);

app.get("/", (req, res) => {
  res.send("Hello WOrld");
});
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    server.listen(4000, () => {
      console.log("App is running on port 4000");
    });
  })
  .catch((error) => {
    console.log("Error connecting mongo db ", error);
  });
