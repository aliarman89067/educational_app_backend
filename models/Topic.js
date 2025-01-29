import mongoose, { model, Schema } from "mongoose";

const topicSchema = new Schema(
  {
    topic: { type: String, required: true },
    mcqs: [{ type: mongoose.Schema.Types.ObjectId, ref: "mcqs" }],
  },
  { timestamps: true }
);

const topicModel = model("topics", topicSchema);
export default topicModel;
