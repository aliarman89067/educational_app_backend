import { model, Schema } from "mongoose";

const soloRoomSchema = new Schema({
  subjectId: { type: Schema.Types.ObjectId, required: true, ref: "subjects" },
  yearId: { type: Schema.Types.ObjectId, ref: "years" },
  topicId: { type: Schema.Types.ObjectId, ref: "topics" },
  quizType: { type: String, required: true },
  quizes: [{ type: Schema.Types.ObjectId, required: true, ref: "mcqs" }],
  user: { type: Schema.Types.ObjectId, ref: "users" },
  isAlive: { type: Boolean, required: true },
  seconds: { type: String, required: true },
});

const SoloRoomModel = model("soloRoom", soloRoomSchema);
export default SoloRoomModel;
