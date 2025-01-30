import express from "express";
import subjectModel from "../models/Subject.js";
import yearModel from "../models/Year.js";
import topicModel from "../models/Topic.js";
import mcqModel from "../models/Mcq.js";
import SoloRoomModel from "../models/SoloRoom.js";
import OnlineRoomModel from "../models/OnlineRoom.js";
import HistoryModel from "../models/History.js";
import UserModel from "../models/User.js";
import OnlineHistoryModel from "../models/OnlineHistory.js";

const router = express.Router();

// Get all Quiz for QuizGrid Function
router.get("/get-all/:quizType", async (req, res) => {
  try {
    // Destruturing values from payload
    const { quizType } = req.params;
    let data;
    // Getting All Docs from Database on the basis of Quiz Type
    if (quizType === "Topical") {
      data = await subjectModel
        .find()
        .populate({ path: "topics" })
        .select("-years");
    } else {
      data = await subjectModel
        .find()
        .populate({ path: "years" })
        .select("-topics");
    }
    // Returning response
    res.status(200).json({ success: true, data: data });
  } catch (error) {
    // In case we face any error
    console.log(error);
  }
});

// Getting Data for Solo Player Function
router.post("/solo-player", async (req, res) => {
  try {
    // Destructuring params from request body
    const { subjectId, yearIdOrTopicId, quizLimit, quizType, seconds } =
      req.body;
    // Validating Request payload
    if (!subjectId || !yearIdOrTopicId || !quizLimit || !quizType || !seconds) {
      return res.status(404).json({
        success: false,
        message: "Payload is not correct!",
      });
    }

    // Getting all MCQS Object IDs
    let data;
    if (quizType === "Yearly") {
      data = await yearModel.findOne({ _id: yearIdOrTopicId }).select("mcqs");
    } else if (quizType === "Topical") {
      data = await topicModel.findOne({ _id: yearIdOrTopicId }).select("mcqs");
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
    // Creating Solor room Doc in Database and making it alive
    let newSoloRoom;
    if (quizType === "Yearly") {
      newSoloRoom = await SoloRoomModel.create({
        subjectId,
        yearId: yearIdOrTopicId,
        quizes: targetQuiz,
        quizType,
        isAlive: true,
        seconds,
      });
    } else if (quizType === "Topical") {
      newSoloRoom = await SoloRoomModel.create({
        subjectId,
        topicId: yearIdOrTopicId,
        quizType,
        quizes: targetQuiz,
        isAlive: true,
        seconds,
      });
    } else {
      return res.status(404).json({
        success: false,
        message: "Quiz Type is not correct!",
      });
    }
    // Returning response
    res.status(201).json({ success: true, data: newSoloRoom._id });
  } catch (error) {
    // In case we face any error
    console.log(error);
  }
});
// Getting SoloRoom and All the Other Info With Object Id
router.get("/get-room/:soloRoomId", async (req, res) => {
  try {
    // Destructuring soloRoomId from params
    const { soloRoomId } = req.params;
    // Validating request payload
    if (!soloRoomId) {
      return res
        .status(404)
        .json({ success: false, message: "Solo Room Id is not exist!" });
    }
    // Validating is Solo Room is Alive
    const isSoloRoomAlive = await SoloRoomModel.findOne({
      _id: soloRoomId,
    }).select("isAlive");
    // If its not alive thats means we need to navigate user to quiz page again
    if (!isSoloRoomAlive.isAlive || !isSoloRoomAlive) {
      return res.status(400).json({
        success: false,
        message: "This Solo Room is not valid. Its expired!",
      });
    }
    // Getting All Data like Subject, SubjectId, Year, YearId, MCQS, IsAlive
    const soloRoomData = await SoloRoomModel.findOne({ _id: soloRoomId })
      .populate({ path: "subjectId", select: "_id subject" })
      .populate({ path: "yearId", select: "_id year" })
      .populate({ path: "topicId", select: "_id topic" })
      .populate({ path: "quizes" });
    // Returning response
    res.status(200).json({ success: true, data: soloRoomData });
  } catch (error) {
    // In case we face any error
    console.log(error);
    res.status(400).json({ success: false, message: "Something went wrong" });
  }
});
// Leave Solo Room function
router.put("/leave-solo-room", async (req, res) => {
  try {
    // Destructuring request payload
    const { roomId } = req.body;
    // Validating request payload values
    if (!roomId) {
      return res
        .status(404)
        .json({ success: false, message: "Solo Room Id not exist!" });
    }
    // Update Solo Room isAlive value to false to this room can be shutdowm
    await SoloRoomModel.findByIdAndUpdate(roomId, { isAlive: false });
    res.status(200).json({
      success: true,
      message: "This Solo room is shut down mean isAlive property set to false",
    });
  } catch (error) {
    // In case we face any error
    console.log(error);
  }
});
router.put("/leave-online-room", async (req, res) => {
  try {
    // Destructuring request payload
    const { roomId } = req.body;
    // Validating request payload values
    if (!roomId) {
      return res
        .status(404)
        .json({ success: false, message: "Solo Room Id not exist!" });
    }
    // Update Solo Room isAlive value to false to this room can be shutdowm
    await OnlineRoomModel.findByIdAndUpdate(roomId, { isAlive: false });
    res.status(200).json({
      success: true,
      message:
        "This Online room is shut down mean isAlive property set to false",
    });
  } catch (error) {
    // In case we face any error
    console.log(error);
  }
});
// Create History of the Quiz Room and De-Active the target room
router.post("/submit-solo-quiz", async (req, res) => {
  try {
    // Destructuring the values from payload
    const { roomId, type, mcqs, states, userId, time } = req.body;
    console.log(states);

    // Validating the values
    if (!roomId || !type || !mcqs || !states || !time) {
      return res
        .status(404)
        .json({ success: false, message: "Payload are not correct!" });
    }
    // De-Activate the target Room By Id
    await SoloRoomModel.findByIdAndUpdate(
      roomId,
      { isAlive: false },
      { new: true }
    );
    // Creating History Data in Database
    const newHistory = await HistoryModel.create({
      mcqs: mcqs,
      quizIdAndValue: states,
      roomType: type,
      soloRoom: roomId,
      user: userId,
      time,
    });
    res.status(201).json({ success: true, data: newHistory._id });
  } catch (error) {
    // In case we face any error
    console.log(error);
  }
});
// Getting Solo Room result with history Object Id
router.get("/get-solo-result/:resultId", async (req, res) => {
  try {
    const { resultId } = req.params;
    // Validating payload values
    if (!resultId) {
      return res
        .status(404)
        .json({ success: false, message: "Result Id not exist!" });
    }
    // Getting History Model Doc from database with room id
    const data = await HistoryModel.findOne({ _id: resultId })
      .populate({ path: "mcqs" })
      .populate({ path: "user" })
      .populate({
        path: "soloRoom",
        select: "_id subjectId yearId topicId",
        populate: {
          path: "subjectId yearId topicId",
          select: "subject year topic",
        },
      });
    // returning response
    res.status(200).json({ success: true, data: data });
  } catch (error) {
    // In case we face any error
    console.log(error);
  }
});
// Re-Active solo Room so student can play again same quiz
router.put("/reactive-solo-room", async (req, res) => {
  try {
    // Destruturing the values
    const { soloRoomId } = req.body;
    // Validating request payload
    if (!soloRoomId) {
      return res
        .status(404)
        .json({ success: false, message: "Solo Room Id not exist!" });
    }
    // Updating Solo Room Doc in Database
    const soloRoomDoc = await SoloRoomModel.findByIdAndUpdate(
      soloRoomId,
      { isAlive: true },
      { new: true }
    );
    // Returning resposen to client side
    res.status(200).json({ success: true, data: soloRoomDoc._id });
  } catch (error) {
    // In case we face any error
    console.log(error);
  }
});
router.get("/get-online-room/:onlineRoomId/:userId", async (req, res) => {
  try {
    // Destructuring onlineRoomId from params
    const { onlineRoomId, userId } = req.params;
    // Validating request payload
    if (!onlineRoomId || !userId) {
      return res.status(404).json({
        success: false,
        message: "Online Room Id or User Id is not exist!",
      });
    }
    // Validating is Solo Room is Alive
    const isOnlineRoomAlive = await OnlineRoomModel.findOne({
      _id: onlineRoomId,
    }).select("isAlive");
    // If its not alive thats means we need to navigate user to quiz page again
    if (!isOnlineRoomAlive.isAlive || !isOnlineRoomAlive) {
      return res.status(400).json({
        success: false,
        message: "This Online Room is not valid. Its expired!",
      });
    }
    // Getting All Data like Subject, SubjectId, Year, YearId, MCQS, IsAlive
    const onlineRoomData = await OnlineRoomModel.findOne({
      _id: onlineRoomId,
      isAlive: true,
    })
      .populate({ path: "subjectId", select: "_id subject" })
      .populate({ path: "yearId", select: "_id year" })
      .populate({ path: "topicId", select: "_id topic" })
      .populate({ path: "quizes" });

    // Finding opponent
    // Validating that both user exist in online room
    if (!onlineRoomData.user1 || !onlineRoomData.user2) {
      return res.status(400).json({
        success: false,
        message:
          "One user is missing in online room means its not completely updated!",
      });
    }
    let opponent;
    if (onlineRoomData.user1 === userId) {
      opponent = await UserModel.findOne({
        clerkId: onlineRoomData.user2,
      });
    } else {
      opponent = await UserModel.findOne({
        clerkId: onlineRoomData.user1,
      });
    }
    if (!opponent) {
      return res.status(400).json({
        success: false,
        message: "Can't find your opponent",
      });
    }
    // Returning response
    res.status(200).json({ success: true, data: { onlineRoomData, opponent } });
  } catch (error) {
    // In case we face any error
    console.log(error);
    throw new Error("Something went wrong!");
  }
});
// Getting online history or status function
router.get("/get-online-history/:resultId/:roomId", async (req, res) => {
  try {
    // Destructuring payload
    const { resultId, roomId } = req.params;
    // Validate payload
    if (!resultId) {
      return res
        .status(404)
        .json({
          success: false,
          message: "Result Id or Room Id is not exist!",
        });
    }
    // Finding room
    const findOnlineRoom = await OnlineRoomModel.findOne({
      _id: roomId,
      isAlive: true,
    });
    if (!findOnlineRoom) {
      return res
        .status(400)
        .json({ success: false, message: "Room is expired!" });
    }
    // First I find my opponent history
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
    const myHistory = await OnlineHistoryModel.findOne({
      roomId,
      _id: resultId,
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
    // const myUser = await UserModel.findOne({
    //   clerkId: myHistory.user,
    // });
    let opponentUser;
    if (findOnlineRoom.user1 === myHistory.user) {
      opponentUser = await UserModel.findOne({
        clerkId: findOnlineRoom.user2,
      }).select("fullName imageUrl clerkId");
    } else {
      opponentUser = await UserModel.findOne({
        clerkId: findOnlineRoom.user1,
      }).select("fullName imageUrl clerkId");
    }

    // If Opponents history exist then I find my history and return and data
    if (findOpponentHistory) {
      await OnlineRoomModel.findOneAndUpdate(
        {
          _id: roomId,
        },
        { isAlive: false }
      );
      res.status(200).json({
        success: true,
        isPending: false,
        data: { myHistory, opponentUser, opponentHistory: findOpponentHistory },
      });
    } else {
      // If I didn't find any opponent hsitory thats mean my opponent is still playing
      res.status(200).json({
        success: true,
        isPending: true,
        data: {
          myData: myHistory,
          opponentUser,
          time: { fullTime: findOnlineRoom.seconds, timeTaken: myHistory.time },
        },
      });
    }
  } catch (error) {
    res.status(400).json({ success: false, message: "Something went wrong" });
    console.log(error);
  }
});
export default router;
