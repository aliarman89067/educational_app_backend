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

// Socket Io Code
io.on("connection", (socket) => {
  // Creating createRoom function
  const createRoom = async (data) => {
    // Destructuring Data
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

    // Validating values
    if (
      subjectId &&
      yearIdOrTopicId &&
      quizLimit &&
      quizType &&
      sessionId &&
      userId &&
      name &&
      imageUrl &&
      seconds
    ) {
      // Creating handshake room to search for matching students
      const newHandShakeRoom = new OnlineHandShakeRoomModel();
      newHandShakeRoom.subjectId = subjectId;
      newHandShakeRoom.sessionId = sessionId;
      newHandShakeRoom.quizLimit = quizLimit;
      newHandShakeRoom.quizType = quizType;
      newHandShakeRoom.isAlive = true;
      newHandShakeRoom.user = userId;

      if (quizType === "Yearly") {
        newHandShakeRoom.yearId = yearIdOrTopicId;
      } else {
        newHandShakeRoom.topicId = yearIdOrTopicId;
      }

      await newHandShakeRoom.save();
      // Making some handler variables
      let findSameStudent;
      let totalRetry = 10;
      let retryCount = 0;
      let newOnlineRoomId;
      let user1Id;
      let user2Id;
      let timeOutId;

      // Search Student function
      const searchStudent = async () => {
        if (retryCount >= totalRetry) {
          return null; // No match found after retries
        }

        // Searching for a matching student in the database
        if (quizType === "Yearly") {
          findSameStudent = await OnlineHandShakeRoomModel.findOne({
            subjectId,
            yearId: yearIdOrTopicId,
            sessionId: { $ne: sessionId },
            isAlive: true,
          });
        } else {
          findSameStudent = await OnlineHandShakeRoomModel.findOne({
            subjectId,
            topicId: yearIdOrTopicId,
            sessionId: { $ne: sessionId },
            isAlive: true,
          });
        }
        // If we find an student
        if (findSameStudent) {
          // Making unique key so we can search student later by online room
          const uniqueKey1 = userId + findSameStudent.user;
          const uniqueKey2 = findSameStudent.user + userId;
          // Finding existing room for same unique key
          const findOnlineRoom = await OnlineRoomModel.findOne({
            uniqueKey: { $in: [uniqueKey1, uniqueKey2] },
            isAlive: true,
            isEnded: false,
          });

          // Getting all MCQS Object IDs
          let data;
          if (quizType === "Yearly") {
            data = await yearModel
              .findOne({ _id: yearIdOrTopicId })
              .select("mcqs");
          } else if (quizType === "Topical") {
            data = await topicModel
              .findOne({ _id: yearIdOrTopicId })
              .select("mcqs");
          } else {
            return res.status(404).json({
              success: false,
              message: "Quiz Type is not correct!",
            });
          }
          // Sorted X number of random Quizes make sure that they dont repeat
          const targetQuiz = [];
          // Runs while loop until targetQuiz length goes up to 10 Quiz IDS
          while (targetQuiz.length < quizLimit) {
            // Getting one random Quiz ID
            const randomQuizId =
              data.mcqs[Math.ceil(Math.random() * data.mcqs.length - 1)];
            // Checking if that ID is not already included in targetQuiz Array
            if (!targetQuiz.includes(randomQuizId)) {
              // If so push that Quiz ID
              targetQuiz.push(randomQuizId);
            }
          }
          // If online room not exist we create one with all props
          if (!findOnlineRoom) {
            // Creating Online Room
            const newOnlineRoom = new OnlineRoomModel();
            newOnlineRoom.subjectId = subjectId;
            newOnlineRoom.uniqueKey = uniqueKey1;
            newOnlineRoom.quizType = quizType;
            newOnlineRoom.isAlive = true;
            newOnlineRoom.quizes = targetQuiz;
            newOnlineRoom.seconds = seconds;
            if (quizType === "Yearly") {
              newOnlineRoom.yearId = yearIdOrTopicId;
            } else {
              newOnlineRoom.topicId = yearIdOrTopicId;
            }
            newOnlineRoom.user1 = userId;
            newOnlineRoom.user1SessionId = sessionId;
            await newOnlineRoom.save();
            // Passing new room _id and user 1 and 2 clerk id to handler variables
            newOnlineRoomId = newOnlineRoom._id;
            user1Id = userId;
            user2Id = findSameStudent.user;
          } else {
            console.log("Room not found!");

            // If we find an onlineRoom that means user 1 already created we just pass user2 clerk id
            // So we do that
            await OnlineRoomModel.findByIdAndUpdate(
              findOnlineRoom._id,
              {
                user2: userId,
                user2SessionId: sessionId,
              },
              { new: true }
            );
            // Passing new room _id and user 1 and 2 clerk id to handler variables
            newOnlineRoomId = findOnlineRoom._id;

            user1Id = userId;
            user2Id = findSameStudent.user;
          }
          // Returning all values
          return { newOnlineRoomId, user1Id, user2Id };
        } else {
          // If we dont find any matching same student we recall our search student function
          retryCount++;
          return new Promise((resolve) => {
            timeOutId = setTimeout(() => resolve(searchStudent()), 1000);
          });
        }
      };

      const result = await searchStudent();
      // Clearing timeout function after 10 seconds
      clearTimeout(timeOutId);
      // If we find an result
      if (result) {
        // Destruturing values from return object
        let opponentUser;
        const { newOnlineRoomId, user1Id, user2Id } = result;
        // Making opponent dynamically
        if (user1Id === userId) {
          opponentUser = await UserModel.findOne({ clerkId: user2Id }).select(
            "fullName imageUrl"
          );
        } else {
          opponentUser = await UserModel.findOne({ clerkId: user1Id });
        }
        let totalRetry = 10;
        let retry = 0;

        const checkOnlineRoom = async () => {
          if (retry >= totalRetry) return;

          const newOnlineRoom = await OnlineRoomModel.findById(newOnlineRoomId);

          if (newOnlineRoom.user1 && newOnlineRoom.user2) {
            console.log("Both users appear, meaning online room is valid");
            return true;
          } else {
            console.log("User 1", newOnlineRoom.user1);
            console.log("User 2", newOnlineRoom.user2);
            console.log("Online room is not valid, running function again");
            retry++;

            // Wait for 500ms before retrying
            await new Promise((resolve) => setTimeout(resolve, 500));

            return checkOnlineRoom(); // Recursive call after waiting
          }
        };
        const validOnlineRoom = await checkOnlineRoom();
        // Sending success data to client by socket io
        if (validOnlineRoom) {
          socket.emit("student-find", {
            roomId: newOnlineRoomId,
            opponent: opponentUser,
          });
        } else {
          console.log("can't find second user");
          socket.emit("no-student-found", { error: "failed-to-find-student" });
        }

        // Disable onlnie handle shake room
        await OnlineHandShakeRoomModel.findByIdAndUpdate(
          findSameStudent._id,
          { isAlive: false },
          { new: true }
        );
      } else {
        // If we dont find any result
        await OnlineHandShakeRoomModel.findByIdAndUpdate(
          newHandShakeRoom._id,
          { isAlive: false },
          { new: true }
        );
        socket.emit("no-student-found", { error: "failed-to-find-student" });
      }
    } else {
      // If payload is not correct we pass an error to client
      socket.emit("payload-error", { error: "payload is not correct" });
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
      if (findOnlineRoom.user1 === userId) {
        io.to(findOnlineRoom.user2SessionId).emit("opponent-completed", {
          isCompleted: true,
          time: completeTime,
        });
        socket.emit("complete-response", { _id: newOnlineHistory._id });
      } else if (findOnlineRoom.user2 === userId) {
        io.to(findOnlineRoom.user1SessionId).emit("opponent-completed", {
          isCompleted: true,
          time: completeTime,
        });
        socket.emit("complete-response", { _id: newOnlineHistory._id });
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
        console.log("Run again");
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
          console.log("Running again");
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
  socket.on("create-online-room", createRoom);
  socket.on("online-submit", submitOnlineRoom);
  socket.on("get-online-history", getOnlineHistory);

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    // Remove event listeners when the socket disconnects
    socket.off("create-online-room", createRoom);
    socket.off("online-submit", submitOnlineRoom);
    socket.off("get-online-history", getOnlineHistory);
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
