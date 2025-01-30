import { model, Schema } from "mongoose";

const onlineHistorySchema = new Schema({
  roomId: { type: Schema.Types.ObjectId, ref: "onlineroom" },
  mcqs: [{ type: Schema.Types.ObjectId, ref: "mcqs" }],
  user: { type: String },
  roomType: { type: String, required: true },
  quizIdAndValue: [
    {
      _id: { type: String, required: true },
      isCorrect: { type: Boolean, required: true },
      selected: { type: String, required: true },
    },
  ],
  time: { type: Number, requried: true },
});

const OnlineHistoryModel = model("onlinehistory", onlineHistorySchema);
export default OnlineHistoryModel;
