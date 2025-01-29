import { Schema, model } from "mongoose";

const historySchema = new Schema({
  mcqs: [{ type: Schema.Types.ObjectId, ref: "mcqs" }],
  user: { type: String },
  roomType: { type: String, required: true },
  soloRoom: { type: Schema.Types.ObjectId, ref: "soloRoom" },
  quizIdAndValue: [
    {
      _id: { type: String, required: true },
      isCorrect: { type: Boolean, required: true },
      selected: { type: String, required: true },
    },
  ],
  time: { type: Number, requried: true },
});

const HistoryModel = model("history", historySchema);
export default HistoryModel;
