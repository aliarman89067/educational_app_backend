import { Schema, model } from "mongoose";

const OnlineHandShakeRoomSchema = new Schema({
  sessionId: { type: String, required: true },
  subjectId: { type: Schema.Types.ObjectId, ref: "subjects" },
  yearId: { type: Schema.Types.ObjectId, ref: "years" },
  topicId: { type: Schema.Types.ObjectId, ref: "topics" },
  quizLimit: { type: Number, required: true },
  user: { type: String, required: true },
  quizType: { type: String, required: true },
  isAlive: { type: Boolean, required: true },
});

const OnlineHandShakeRoomModel = model(
  "onlinehandshakeroom",
  OnlineHandShakeRoomSchema
);
export default OnlineHandShakeRoomModel;
